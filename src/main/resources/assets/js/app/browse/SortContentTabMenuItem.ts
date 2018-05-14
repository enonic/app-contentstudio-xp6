import '../../api.ts';
import ChildOrder = api.content.order.ChildOrder;
import TabMenuItemBuilder = api.ui.tab.TabMenuItemBuilder;
import Button = api.ui.button.Button;
import i18n = api.util.i18n;

type AscDescOrder = { ascending: ChildOrder, descending: ChildOrder };
export type SortChildOrder = ChildOrder | AscDescOrder;

export class SortContentTabMenuItem extends api.ui.tab.TabMenuItem {

    private childOrder: SortChildOrder;

    private selectedChildOrder: ChildOrder;

    private selectedIconClass: string;

    private ascButton: Button;

    private descButton: Button;

    constructor(builder: SortContentTabMenuItemBuilder) {

        const isNotSingle = order => !(order instanceof ChildOrder);

        const itemBuilder = new TabMenuItemBuilder().setLabel(builder.label);
        if (isNotSingle(builder.childOrder)) {
            // Disable item click handlers
            itemBuilder.setClickHandler(() => void 0);
        }

        super(<TabMenuItemBuilder>itemBuilder);

        this.childOrder = builder.childOrder;

        if (isNotSingle(builder.childOrder)) {
            const {ascending, descending} = <AscDescOrder>this.childOrder;

            const createButton = (order: ChildOrder) => {
                const type = ascending === order ? 'ascending' : 'descending';
                const iconClass = `icon-sort-${order.isAlpha() ? 'alpha' : 'num'}-${type.slice(0, -6)}`;

                const button = new Button();
                button.addClass('sorting-order').addClass(iconClass);
                button.setTitle(i18n(`field.sortType.${type}`));
                button.onClicked(() => {
                    this.selectedChildOrder = order;
                    this.selectedIconClass = iconClass;
                    this.markSelected();
                    this.select();
                });
                button.onFocus(() => {
                    this.selectedChildOrder = order;
                    this.selectedIconClass = iconClass;
                });
                return button;
            };

            this.ascButton = createButton(ascending);
            this.descButton = createButton(descending);

            this.appendChildren(this.ascButton, this.descButton);

            this.selectedChildOrder = descending;
            this.selectedIconClass = `icon-sort-${descending.isAlpha() ? 'alpha' : 'num'}-desc`;
            this.markSelected();
        } else {
            this.addClass('single');
            this.selectedChildOrder = <ChildOrder>builder.childOrder;
            this.selectedIconClass = '';
        }
    }

    giveFocusToAscending() {
        if (!this.ascButton) {
            return super.giveFocus();
        }
        return this.ascButton.giveFocus();
    }

    giveFocusToDescending() {
        if (!this.descButton) {
            return super.giveFocus();
        }
        return this.descButton.giveFocus();
    }

    giveFocus() {
        return this.giveFocusToDescending();
    }

    getSelectedChildOrder(): ChildOrder {
        return this.selectedChildOrder;
    }

    getSelectedIconClass(): string {
        return this.selectedIconClass;
    }

    getTooltip() {
        const label = this.getLabel();
        if (this.childOrder instanceof ChildOrder) {
            return label;
        }
        const {ascending} = <AscDescOrder>this.childOrder;
        const type = this.selectedChildOrder === ascending ? 'ascending' : 'descending';
        return i18n(`tooltip.sortType.${type}`, label);
    }

    hasChildOrder(order: ChildOrder): boolean {
        if (this.childOrder instanceof ChildOrder) {
            return this.childOrder === order;
        }
        const {ascending, descending} = <AscDescOrder>this.childOrder;
        return ascending === order || descending === order;
    }

    private markSelected() {
        const {ascending, descending} = <AscDescOrder>this.childOrder;
        if (this.selectedChildOrder === ascending) {
            this.descButton.removeClass('selected');
            this.ascButton.addClass('selected');
        } else if (this.selectedChildOrder === descending) {
            this.ascButton.removeClass('selected');
            this.descButton.addClass('selected');
        }
    }
}

export class SortContentTabMenuItemBuilder {

    label: string;

    childOrder: SortChildOrder;

    setLabel(label: string): SortContentTabMenuItemBuilder {
        this.label = label;
        return this;
    }

    setChildOrder(value: SortChildOrder): SortContentTabMenuItemBuilder {
        this.childOrder = value;
        return this;
    }

    build(): SortContentTabMenuItem {
        return new SortContentTabMenuItem(this);
    }

}
