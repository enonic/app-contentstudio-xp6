import './../../api.ts';
import {ComponentView, ComponentViewBuilder} from '../ComponentView';
import {TextItemType} from './TextItemType';
import {TextPlaceholder} from './TextPlaceholder';
import {TextComponentViewer} from './TextComponentViewer';
import {LiveEditPageDialogCreatedEvent} from '../LiveEditPageDialogCreatedEvent';
import {Highlighter} from '../Highlighter';
import {ItemView} from '../ItemView';
import {PageViewController} from '../PageViewController';
import {DragAndDrop} from '../DragAndDrop';
import {PageView} from '../PageView';

declare var CONFIG;

import TextComponent = api.content.page.region.TextComponent;
import HTMLAreaBuilder = api.util.htmlarea.editor.HTMLAreaBuilder;
import HTMLAreaHelper = api.util.htmlarea.editor.HTMLAreaHelper;
import ModalDialog = api.util.htmlarea.dialog.ModalDialog;
import Promise = Q.Promise;
import i18n = api.util.i18n;

export class TextComponentViewBuilder
    extends ComponentViewBuilder<TextComponent> {
    constructor() {
        super();
        this.setType(TextItemType.get());
    }
}

export class TextComponentView
    extends ComponentView<TextComponent> {

    private rootElement: api.dom.Element;

    private htmlAreaEditor: any;

    private isInitializingEditor: boolean;

    private focusOnInit: boolean;

    private editorContainer: api.dom.DivEl;

    public static debug: boolean = false;

    private static DEFAULT_TEXT: string = '';

    private static EDITOR_FOCUSED_CLASS: string = 'editor-focused';

    // special handling for click to allow dblclick event without triggering 2 clicks before it
    public static DBL_CLICK_TIMEOUT: number = 250;
    private singleClickTimer: number;
    private lastClicked: number;

    private modalDialog: ModalDialog;
    private currentDialogConfig: any;

    private authRequest: Promise<void>;
    private editableSourceCode: boolean;

    constructor(builder: TextComponentViewBuilder) {
        super(builder.setPlaceholder(new TextPlaceholder()).setViewer(new TextComponentViewer()).setComponent(builder.component));

        this.addTextContextMenuActions();
        this.lastClicked = 0;
        this.liveEditModel = builder.parentRegionView.getLiveEditModel();
        this.isInitializingEditor = false;

        this.addClassEx('text-view');

        this.initializeRootElement();

        this.rootElement.getHTMLElement().onpaste = this.handlePasteEvent.bind(this);

        this.authRequest =
            new api.security.auth.IsAuthenticatedRequest().sendAndParse().then((loginResult: api.security.auth.LoginResult) => {
                this.editableSourceCode = loginResult.isContentExpert();
            });

        this.onAdded(() => { // is triggered on item insert or move
            if (!this.initOnAdd) {
                return;
            }

            this.initialize();
        });

        this.onRemoved(() => {
            this.destroyEditor();
        });

        let handleDialogCreated = (event) => {
            if (this.currentDialogConfig === event.getConfig()) {
                this.modalDialog = event.getModalDialog();
            }
        };

        LiveEditPageDialogCreatedEvent.on(handleDialogCreated.bind(this));
    }

    private initialize() {
        if (api.BrowserHelper.isFirefox() && !!tinymce.activeEditor) {
            tinymce.activeEditor.fire('blur');
        }
        this.focusOnInit = true;
        this.addClass(TextComponentView.EDITOR_FOCUSED_CLASS);
        if (!this.isEditorReady()) {
            this.initEditor();
        } else if (this.htmlAreaEditor) {
            this.reInitEditor(); // on added, inline editor losses its root element of the editable area
        }
        this.unhighlight();
    }

    private reInitEditor() {
        this.destroyEditor();
        this.editorContainer.remove();
        this.editorContainer = null;
    }

    private getContent(): api.content.ContentSummary {
        return this.liveEditModel.getContent();
    }

    private getContentPath(): api.content.ContentPath {
        return this.liveEditModel.getContent().getPath();
    }

    private getApplicationKeys(): api.application.ApplicationKey[] {
        return this.liveEditModel.getSiteModel().getSite().getApplicationKeys();
    }

    private isAllTextSelected(): boolean {
        return this.rootElement.getHTMLElement().innerText.trim() === window['getSelection']().toString();
    }

    private handlePasteEvent() {
        if (this.isAllTextSelected()) {
            this.rootElement.getHTMLElement().innerHTML = '';
        }
    }

    highlight() {
        if (!this.isEditMode() && !this.isDragging()) {
            super.highlight();
        }
    }

    unhighlight() {
        if (!this.isEditMode()) {
            super.unhighlight();
        }
    }

    protected isDragging(): boolean {
        return DragAndDrop.get().isDragging();
    }

    private initializeRootElement() {
        for (let i = 0; i < this.getChildren().length; i++) {
            let child = this.getChildren()[i];
            if (child.getEl().getTagName().toUpperCase() === 'SECTION') {
                this.rootElement = child;
                // convert image urls in text component for web
                child.setHtml(HTMLAreaHelper.prepareImgSrcsInValueForEdit(child.getHtml()), false);
                break;
            }
        }
        if (!this.rootElement) {
            // create it in case of new component
            this.rootElement = new api.dom.SectionEl();
            this.prependChild(this.rootElement);
        }
    }

    private doHandleDbClick(event: MouseEvent) {
        if (this.isEditMode() && this.isActive()) {
            return;
        }

        this.focusOnInit = true;
        this.startPageTextEditMode();
        if (this.htmlAreaEditor) {
            this.htmlAreaEditor.focus();
            this.addClass(TextComponentView.EDITOR_FOCUSED_CLASS);
        }
        Highlighter.get().hide();
    }

    private doHandleClick(event: MouseEvent) {
        if (this.isEditMode()) {
            if (this.isActive()) {
                return;
            }
            if (this.htmlAreaEditor) {
                this.htmlAreaEditor.focus();
            }
            return;
        }

        super.handleClick(event);
    }

    handleClick(event: MouseEvent) {
        if (TextComponentView.debug) {
            console.group('Handling click [' + this.getId() + '] at ' + new Date().getTime());
            console.log(event);
        }

        event.stopPropagation();
        if (event.which === 3) { // right click
            event.preventDefault();
        }

        if (this.isEditMode() && this.isActive()) {
            if (TextComponentView.debug) {
                console.log('Is in text edit mode, not handling click');
                console.groupEnd();
            }
            return;
        }

        let timeSinceLastClick = new Date().getTime() - this.lastClicked;

        if (timeSinceLastClick > TextComponentView.DBL_CLICK_TIMEOUT) {
            this.singleClickTimer = window.setTimeout(() => {
                if (TextComponentView.debug) {
                    console.log('no dblclick occured during ' + TextComponentView.DBL_CLICK_TIMEOUT + 'ms, notifying click', this);
                    console.groupEnd();
                }

                this.doHandleClick(event);
            }, TextComponentView.DBL_CLICK_TIMEOUT);

        } else {

            if (TextComponentView.debug) {
                console.log('dblclick occured after ' + timeSinceLastClick + 'ms, notifying dbl click', this);
                // end the group started by the first click first
                console.groupEnd();
            }
            clearTimeout(this.singleClickTimer);
            this.doHandleDbClick(event);
        }
        this.lastClicked = new Date().getTime();
    }

    isEditMode(): boolean {
        return this.hasClass('edit-mode');
    }

    isActive(): boolean {
        return this.hasClass('active');
    }

    setEditMode(flag: boolean) {
        if (!this.initOnAdd) {
            return;
        }

        if (!flag) {
            if (this.htmlAreaEditor) {
                this.processEditorValue();
            }
            this.removeClass(TextComponentView.EDITOR_FOCUSED_CLASS);
            this.triggerEventInActiveEditorForFirefox('blur');
        }

        this.toggleClass('edit-mode', flag);
        this.setDraggable(!flag);

        if (flag) {
            if (!this.isEditorReady()) {
                this.initEditor();
            }

            if (this.component.isEmpty()) {
                if (this.htmlAreaEditor) {
                    this.htmlAreaEditor.setContent(TextComponentView.DEFAULT_TEXT);
                }
                this.rootElement.setHtml(TextComponentView.DEFAULT_TEXT, false);
                this.selectText();
            }

            this.triggerEventInActiveEditorForFirefox('focus');
        }
    }

    private triggerEventInActiveEditorForFirefox(eventName: string) {
        if (api.BrowserHelper.isFirefox()) {
            let activeEditor = tinymce.activeEditor;
            if (activeEditor) {
                activeEditor.fire(eventName);
            }
        }
    }

    private onFocusHandler(e: FocusEvent) {
        this.addClass(TextComponentView.EDITOR_FOCUSED_CLASS);
    }

    private onBlurHandler(e: FocusEvent) {
        this.removeClass(TextComponentView.EDITOR_FOCUSED_CLASS);

        this.collapseEditorMenuItems();

        setTimeout(() => {
            if (!this.anyEditorHasFocus()) {
                if (PageViewController.get().isTextEditMode()) {
                    PageViewController.get().setTextEditMode(false);
                    // preventing mouse click event that triggered blur from further processing in ItemView
                    PageViewController.get().setNextClickDisabled(true);

                    // enable mouse click handling if click's target was not ItemView
                    setTimeout(() => PageViewController.get().setNextClickDisabled(false), 200);
                }
            }
        }, 50);
    }

    private onKeydownHandler(e: KeyboardEvent) {
        let saveShortcut = (e.keyCode === 83 && (e.ctrlKey || e.metaKey));

        if (saveShortcut) { //Cmd-S
            this.processEditorValue();
        }

        if (e.keyCode === 27 || saveShortcut) { // esc or Cmd-S
            PageViewController.get().setTextEditMode(false);
            this.removeClass(TextComponentView.EDITOR_FOCUSED_CLASS);
        } else if ((e.altKey) && e.keyCode === 9) { // alt+tab for OSX
            let nextFocusable = api.dom.FormEl.getNextFocusable(this, '.xp-page-editor-text-view', true);
            if (nextFocusable) {
                wemjq(nextFocusable.getHTMLElement()).simulate('click');
                nextFocusable.giveFocus();
            } else {
                this.htmlAreaEditor.fire('blur');
            }
        }
    }

    private initEditor(): void {
        if (this.authRequest.isFulfilled()) {
            this.doInitEditor();
        } else {
            this.authRequest.then(() => {
                if (!this.isEditorReady()) {
                    this.doInitEditor();
                }
            });
        }
    }

    private doInitEditor() {
        this.isInitializingEditor = true;
        const assetsUri = CONFIG.assetsUri;
        const id = this.getId().replace(/\./g, '_');

        this.addClass(id);

        if (!this.editorContainer) {
            this.editorContainer = new api.dom.DivEl('tiny-mce-here');
            this.appendChild(this.editorContainer);
        }

        new HTMLAreaBuilder()
            .setSelector('div.' + id + ' .tiny-mce-here')
            .setAssetsUri(assetsUri)
            .setInline(true)
            .onCreateDialog(event => {
                this.currentDialogConfig = event.getConfig();
            }).setFocusHandler(this.onFocusHandler.bind(this))
            .setBlurHandler(this.onBlurHandler.bind(this))
            .setKeydownHandler(this.onKeydownHandler.bind(this))
            .setNodeChangeHandler(this.processEditorValue.bind(this))
            .setFixedToolbarContainer('.mce-toolbar-container')
            .setContent(this.getContent())
            .setEditableSourceCode(this.editableSourceCode)
            .setContentPath(this.getContentPath())
            .setApplicationKeys(this.getApplicationKeys())
            .createEditor()
            .then(this.handleEditorCreated.bind(this));
    }

    private handleEditorCreated(editor: HtmlAreaEditor) {
        this.htmlAreaEditor = editor;
        if (this.component.getText()) {
            this.htmlAreaEditor.setContent(HTMLAreaHelper.prepareImgSrcsInValueForEdit(this.component.getText()));
        } else {
            this.htmlAreaEditor.setContent(TextComponentView.DEFAULT_TEXT);
            this.htmlAreaEditor.selection.select(this.htmlAreaEditor.getBody(), true);
        }
        if (this.focusOnInit && this.isAdded()) {
            if (api.BrowserHelper.isFirefox()) {
                setTimeout(() => {
                    this.forceEditorFocus();
                }, 100);
            } else {
                this.forceEditorFocus();
            }
        }
        this.focusOnInit = false;
        this.isInitializingEditor = false;
        HTMLAreaHelper.updateImageAlignmentBehaviour(editor);
    }

    private forceEditorFocus() {
        if (this.htmlAreaEditor) {
            this.htmlAreaEditor.focus();
            wemjq(this.htmlAreaEditor.getElement()).simulate('click');
        }
        this.startPageTextEditMode();
    }

    private collapseEditorMenuItems() {
        wemjq('.mce-menubtn.mce-active').click();
    }

    private anyEditorHasFocus(): boolean {
        let textItemViews = (<PageView>this.getPageView()).getItemViewsByType(TextItemType.get());

        let editorFocused = textItemViews.some((view: ItemView) => {
            return view.getEl().hasClass(TextComponentView.EDITOR_FOCUSED_CLASS);
        });

        let dialogVisible = !!this.modalDialog && this.modalDialog.isVisible();

        return editorFocused || dialogVisible;
    }

    private processEditorValue() {
        if (!this.htmlAreaEditor) {
            return;
        }

        if (this.isEditorEmpty()) {
            this.component.setText(TextComponentView.DEFAULT_TEXT);
            // copy editor content over to the root html element
            this.rootElement.getHTMLElement().innerHTML = TextComponentView.DEFAULT_TEXT;
        } else {
            // copy editor raw content (without any processing!) over to the root html element
            this.rootElement.getHTMLElement().innerHTML = this.htmlAreaEditor.getContent({format: 'raw'});
            // but save processed text to the component
            this.component.setText(HTMLAreaHelper.prepareEditorImageSrcsBeforeSave(this.htmlAreaEditor.getContent()));
        }
    }

    private isEditorEmpty(): boolean {
        const editorContent = this.htmlAreaEditor.getContent();
        return editorContent.trim() === '' || editorContent === '<h2>&nbsp;</h2>';
    }

    private destroyEditor(): void {
        const editor = this.htmlAreaEditor;
        if (editor) {
            try {
                editor.destroy(false);
            } catch (e) {
                //error thrown in FF on tab close - XP-2624
            }
        }
        this.htmlAreaEditor = null;
    }

    private selectText() {
        if (this.htmlAreaEditor) {
            this.htmlAreaEditor.selection.select(this.htmlAreaEditor.getBody(), true);
        }
    }

    private startPageTextEditMode() {
        let pageView = <PageView>this.getPageView();

        if (pageView.hasSelectedView()) {
            pageView.getSelectedView().deselect();
        }

        if (!pageView.isTextEditMode()) {
            PageViewController.get().setTextEditMode(true);
        }

        this.giveFocus();
    }

    giveFocus() {
        if (!this.isEditMode()) {
            return false;
        }
        return this.rootElement.giveFocus();
    }

    private addTextContextMenuActions() {
        this.addContextMenuActions([
            new api.ui.Action(i18n('action.edit')).onExecuted(() => {
                this.startPageTextEditMode();
                this.focusOnInit = true;
                this.forceEditorFocus();
            })
        ]);
    }

    private isEditorReady(): boolean {
        return !!this.htmlAreaEditor || this.isInitializingEditor;
    }

    extractText(): string {
        if (this.htmlAreaEditor) {
            return this.htmlAreaEditor.getContent({format: 'text'}).trim();
        }

        return wemjq(this.getHTMLElement()).text().trim();
    }
}
