import PrincipalComboBox = api.ui.security.PrincipalComboBox;
import TextArea = api.ui.text.TextArea;
import PEl = api.dom.PEl;
import TextInput = api.ui.text.TextInput;
import ContentSummary = api.content.ContentSummary;
import PrincipalLoader = api.security.PrincipalLoader;
import PrincipalType = api.security.PrincipalType;
import FormItemBuilder = api.ui.form.FormItemBuilder;
import Validators = api.ui.form.Validators;
import FormItem = api.ui.form.FormItem;
import ValidityChangedEvent = api.ValidityChangedEvent;
import PrincipalKey = api.security.PrincipalKey;
import ContentId = api.content.ContentId;
import i18n = api.util.i18n;
import ContentTreeSelectorItem = api.content.resource.ContentTreeSelectorItem;
import RichComboBox = api.ui.selector.combobox.RichComboBox;
import {Issue} from '../Issue';

export class IssueDialogForm
    extends api.ui.form.Form {

    private approversSelector: PrincipalComboBox;

    private description: TextArea;

    private contentItemsSelector: RichComboBox<any>;

    private descriptionText: PEl;

    private title: TextInput;

    private compactAssigneesView: boolean;

    private contentItemsAddedListeners: { (items: ContentTreeSelectorItem[]): void }[] = [];

    private contentItemsRemovedListeners: { (items: ContentTreeSelectorItem[]): void }[] = [];
    private addItemsButtonItem: api.ui.form.FormItem;
    private contentItemsFormItem: api.ui.form.FormItem;
    private contentItemsSelectorLocked: boolean;

    constructor(compactAssigneesView?: boolean) {

        super('issue-dialog-form');

        this.compactAssigneesView = !!compactAssigneesView;

        this.initElements();

        this.initFormView();

    }

    public doRender(): wemQ.Promise<boolean> {
        return super.doRender().then(() => {
            return this.approversSelector.getLoader().load().then(() => {
                this.title.giveFocus();
                return true;
            });
        });
    }

    show() {
        super.show();
        this.displayValidationErrors(false);
    }

    private initElements() {

        this.title = new TextInput('title');

        this.description = new TextArea('description');
        this.description.addClass('description');

        this.descriptionText = new PEl('description-text');

        const principalLoader = new PrincipalLoader().setAllowedTypes([PrincipalType.USER]).skipPrincipals(
            [PrincipalKey.ofAnonymous(), PrincipalKey.ofSU()]);

        this.approversSelector = api.ui.security.PrincipalComboBox.create().setLoader(principalLoader).setMaxOccurences(0).setCompactView(
            this.compactAssigneesView).build();

        this.contentItemsSelector = api.content.ContentComboBox.create().setShowStatus(true).build();

        this.contentItemsSelector.onOptionSelected((option) => {
            this.notifyContentItemsAdded(
                [<ContentTreeSelectorItem>option.getSelectedOption().getOption().displayValue]);
        });

        this.contentItemsSelector.onOptionDeselected((option) => {
            this.notifyContentItemsRemoved(
                [<ContentTreeSelectorItem>option.getSelectedOption().getOption().displayValue]);
        });
    }

    private initFormView() {

        const fieldSet: api.ui.form.Fieldset = new api.ui.form.Fieldset();

        const titleFormItem = this.addValidationViewer(
            new FormItemBuilder(this.title).setLabel(i18n('field.title')).setValidator(Validators.required).build());
        fieldSet.add(titleFormItem);

        const descriptionFormItem = this.addValidationViewer(
            new FormItemBuilder(this.description).setLabel(i18n('field.description')).build());
        fieldSet.add(descriptionFormItem);

        const selectorFormItem = this.addValidationViewer(
            new FormItemBuilder(this.approversSelector).setLabel(i18n('field.assignees')).build());
        selectorFormItem.addClass('issue-approver-selector');
        fieldSet.add(selectorFormItem);

        fieldSet.appendChild(this.descriptionText);

        this.contentItemsFormItem = new FormItemBuilder(this.contentItemsSelector).setLabel(i18n('field.items')).build();
        fieldSet.add(this.contentItemsFormItem);

        const addItemsButton = new api.ui.button.Button(i18n('dialog.issue.addItems'));
        addItemsButton.onClicked((e: MouseEvent) => {
            this.contentItemsFormItem.show();
            this.addItemsButtonItem.hide();
        });
        this.addItemsButtonItem = new FormItemBuilder(addItemsButton).build();
        fieldSet.add(this.addItemsButtonItem);

        this.title.onValueChanged(() => {
            this.validate(true);
        });

        this.approversSelector.onValueChanged(() => {
            this.validate(true);
        });

        this.add(fieldSet);
    }

    private toggleContentItemsSelector(value: boolean) {
        if (!this.contentItemsSelectorLocked) {
            this.contentItemsFormItem.setVisible(value);
            this.addItemsButtonItem.setVisible(!value);
        }
    }

    public setReadOnly(readOnly: boolean) {
        this.title.setReadOnly(readOnly);
        this.description.setReadOnly(readOnly);
        this.approversSelector.setReadOnly(readOnly);

        const titleFormItem = <FormItem>this.title.getParentElement();
        titleFormItem.setVisible(!readOnly);

        const descFormItem = <FormItem>this.description.getParentElement();
        descFormItem.setVisible(!readOnly);

        this.descriptionText.setVisible(readOnly);

        const selectorFormItem = <FormItem>this.approversSelector.getParentElement();
        selectorFormItem.setLabel(readOnly ? i18n('field.assignees') + ':' : i18n('dialog.issue.inviteUsers'));

        this.contentItemsFormItem.setVisible(!readOnly);
        this.addItemsButtonItem.setVisible(!readOnly);
    }

    lockContentItemsSelector(lock: boolean) {
        this.contentItemsSelectorLocked = lock;
        if (lock) {
            this.contentItemsFormItem.hide();
            this.addItemsButtonItem.hide();
        } else {
            this.toggleContentItemsSelector(this.contentItemsSelector.getSelectedValues().length > 0);
        }
    }

    public setIssue(issue: Issue) {
        this.doSetIssue(issue);
    }

    private doSetIssue(issue: Issue) {

        this.title.setValue(issue.getTitle());
        this.description.setValue(issue.getDescription());

        this.descriptionText.setHtml(issue.getDescription());
        this.descriptionText.toggleClass('empty', !issue.getDescription());

        if (this.isRendered()) {
            this.setApprovers(issue.getApprovers());
        } else {
            this.onRendered(() => {
                this.setApprovers(issue.getApprovers());
            });
        }
    }

    public displayValidationErrors(value: boolean) {
        if (value) {
            this.addClass(api.form.FormView.VALIDATION_CLASS);
        } else {
            this.removeClass(api.form.FormView.VALIDATION_CLASS);
        }
    }

    public getTitle(): string {
        return this.title.getValue().trim();
    }

    public getDescription(): string {
        return this.description.getValue().trim();
    }

    public getApprovers(): PrincipalKey[] {
        return this.approversSelector.getSelectedValues().map(value => PrincipalKey.fromString(value));
    }

    public giveFocus(): boolean {
        if (this.title) {
            return this.title.giveFocus();
        }
        return false;
    }

    public reset() {
        this.title.setValue('');
        this.description.setValue('');
        this.descriptionText.setHtml('');
        this.approversSelector.clearCombobox();
        this.approversSelector.setValue('');

        this.contentItemsSelector.clearCombobox();
        this.contentItemsSelector.clearSelection();
        this.lockContentItemsSelector(false);
    }

    public setContentItems(ids: ContentId[], silent: boolean = false) {
        this.toggleContentItemsSelector(ids && ids.length > 0);
        this.contentItemsSelector.clearSelection();
        ids.forEach((id) => {
            this.contentItemsSelector.selectOptionByValue(id.toString(), silent);
        });
    }

    public selectContentItems(contents: ContentSummary[], silent: boolean = false) {
        if (!contents) {
            return;
        }
        this.toggleContentItemsSelector(contents && contents.length > 0);
        contents.forEach((value) => {
            this.contentItemsSelector.select(value, false, silent);
        });
    }

    public deselectContentItems(contents: ContentSummary[], silent: boolean = false) {
        if (!contents) {
            return;
        }
        contents.forEach((value) => {
            this.contentItemsSelector.deselect(value, silent);
        });
        this.toggleContentItemsSelector(this.contentItemsSelector.getSelectedValues().length > 0);
    }

    private addValidationViewer(formItem: FormItem): FormItem {
        let validationRecordingViewer = new api.form.ValidationRecordingViewer();

        formItem.appendChild(validationRecordingViewer);

        formItem.onValidityChanged((event: ValidityChangedEvent) => {
            validationRecordingViewer.setError(formItem.getError());
        });

        return formItem;
    }

    private setApprovers(approvers: PrincipalKey[]) {

        if (approvers) {
            this.approversSelector.setValue(approvers.map(key => key.toString()).join(';'));
        }
    }

    onContentItemsAdded(listener: (items: ContentTreeSelectorItem[]) => void) {
        this.contentItemsAddedListeners.push(listener);
    }

    unContentItemsAdded(listener: (items: ContentTreeSelectorItem[]) => void) {
        this.contentItemsAddedListeners = this.contentItemsAddedListeners.filter((current) => {
            return listener !== current;
        });
    }

    private notifyContentItemsAdded(items: ContentTreeSelectorItem[]) {
        this.contentItemsAddedListeners.forEach((listener) => {
            listener(items);
        });
    }

    onContentItemsRemoved(listener: (items: ContentTreeSelectorItem[]) => void) {
        this.contentItemsRemovedListeners.push(listener);
    }

    unContentItemsRemoved(listener: (items: ContentTreeSelectorItem[]) => void) {
        this.contentItemsRemovedListeners = this.contentItemsRemovedListeners.filter((current) => {
            return listener !== current;
        });
    }

    private notifyContentItemsRemoved(items: ContentTreeSelectorItem[]) {
        this.contentItemsRemovedListeners.forEach((listener) => {
            listener(items);
        });
    }
}
