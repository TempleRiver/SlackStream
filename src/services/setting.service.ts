import { Injectable } from '@angular/core';
import * as fs from 'fs';

let settingPath = '';
export function setSettingPath(path: string) {
    settingPath = path;
}

interface Setting {
    tokens: string[];
    hide_buttons: boolean;
}

@Injectable()
export class SettingService {
    setting: Setting;

    get tokens(): string[] {
        return this.setting.tokens;
    }

    get hide_buttons(): boolean {
        return this.setting.hide_buttons;
    }

    constructor() {
        try {
            this.setting = JSON.parse(fs.readFileSync(settingPath, 'utf8'));
            console.log(this.setting);
        } catch (e) {
            this.setting = {} as Setting;
        }

        if (!this.setting.tokens) { this.setting.tokens = ['']; }
        if (!this.setting.hide_buttons) { this.setting.hide_buttons = false; }
    }

    save() {
        fs.writeFileSync(settingPath, JSON.stringify(this.setting));
    }
}
