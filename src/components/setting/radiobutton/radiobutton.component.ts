import { Component, Input, OnInit } from '@angular/core';
import { RadioButton, RadioButtonChoice } from './radiobutton';

@Component({
    selector: 'ss-radiobutton',
    templateUrl: './radiobutton.component.html',
    styles: []
})
export class RadioButtonComponent implements OnInit {
    @Input() button: RadioButton;

    ngOnInit() {
    }

    constructor() {
    }

    get title(): string {
        return this.button.title;
    }

    get choices(): RadioButtonChoice[] {
        return this.button.choices;
    }
}
