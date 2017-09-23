export class RadioButtonChoice {
    constructor(public name, public value: string, public selected: boolean) {
    }

    get id(): string {
        return this.name + '_' + this.value;
    }
}

export class RadioButton {
    choices: RadioButtonChoice[] = [];
    name: string;

    constructor(public title: string, public choiceValues: string[], defaultValue: string) {
        this.name = title.replace(/ /g, '_');
        for (const choiceValue of choiceValues) {
            this.choices.push(
                new RadioButtonChoice(this.name, choiceValue, (choiceValue === defaultValue))
            );
        }
    }

    get selected(): string {
        for (const choice of this.choices) {
            if (choice.selected) {
                return choice.value;
            }
        }
        return undefined; // should not come here
    }

    set selected(selected: string) {
        for (let choice of this.choices) {
            if (choice.value === selected) {
                choice.selected = true;
            } else {
                choice.selected = false;
            }
        }
    }
}
