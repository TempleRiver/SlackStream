import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { NgForm } from '@angular/forms'; // tslint:disable-line
import * as $ from 'jquery';
import '../../../jquery.textcomplete.js';
import { EmojiService } from '../../../services/slack/slack.service';
import { Channel, DM, DataStore } from '../../../services/slack/slack.types';

@Component({
    selector: 'ss-messageform',
    templateUrl: './message.component.html',
    styles: [require('./message.component.css').toString()],
})
export class MessageFormComponent implements OnChanges {
    @Output() submit = new EventEmitter<string>();
    @Output() close = new EventEmitter();

    @Input() channelLikeID: string;
    @Input() dataStore: DataStore;

    @Input() teamID: string = '';
    @Input() initialText: string = '';
    @Input() extraInfo: string = '';
    @Input() emoji: EmojiService;

    get channel(): Channel {
        return this.dataStore.getChannelById(this.channelLikeID);
    }

    get dm(): DM {
        return this.dataStore.getDMById(this.channelLikeID);
    }

    get channelName(): string {
        const channel = this.dataStore.getChannelById(this.channelID);
        if(channel) { return channel.name; }

        const group = this.dataStore.getGroupById(this.channelID);
        if(group) { return group.name; }

        const dm = this.dataStore.getDMById(this.channelID);
        if(dm) {
            const user = this.dataStore.getUserById(dm.user);
            if(user) { return `DM_to_${user.name}`; }
            const bot = this.dataStore.getBotById(dm.user);
            if(bot) { return `DM_to_${bot.name}`; }
        }
        return '???';
    }

    get channelID(): string {
        return this.channelLikeID;
    }

    ngOnChanges(): void {
        const emojis = this.emoji.allEmojis;
        const users = (this.channel ? this.channel.members.map(m => this.dataStore.getUserById(m).name) : []);

        $('#slack_message_input').textcomplete('destroy');
        $('#slack_message_input').textcomplete([
            { // emojis
                match: /\B:([\-+\w]*)$/,
                search: (term, callback) => {
                    callback($.map(emojis, function (emoji) {
                        return emoji.indexOf(term) !== -1 ? emoji : null;
                    }));
                },
                template: (value) => {
                    return `${this.emoji.convertEmoji(":" + value + ":")} ${value}`;
                },
                replace: (value) => {
                    return ':' + value + ': ';
                },
                index: 1
            },
            { // usernames
                match: /\B\@([_a-zA-Z\.]*)$/,
                search: (term, callback) => {
                    callback($.map(users, user => term == "" || user.indexOf(term) !== -1 ? user : null));
                },
                template: (value) => {
                    return "@" + value;
                },
                replace: (value) => {
                    return '@' + value + ' ';
                },
            index: 1
            }
        ]);
    }

    onClose(): void {
        this.close.emit();
    }

    onSubmit(value: string): void {
        this.submit.emit(value);
    }

    onKeyPress(event: KeyboardEvent, textArea: any): void {
        if (event.key === 'Enter') {
            if (!event.altKey) {
                this.onSubmit(textArea.value);
                event.preventDefault();
            } else {
                textArea.value += '\n';
            }
        }
    }

    onKeyUp(event: KeyboardEvent): void {
        if (event.which === 27) {
            this.close.emit();
        }
    }
}
