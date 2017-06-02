import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
    SlackServiceCollection,
    SlackMessage,
    SlackService,
    SlackReactionAdded,
    SlackReactionRemoved,
    EmojiService
} from '../../../services/slack/slack.service';

import {
    SlackParser,
    ComposedParser,
    LinkParser,
    EmojiParser,
    NewLineParser
} from '../../../services/slack/slack-parser.service';

import { Attachment } from '../../../services/slack/slack.types';
import { GlobalEventService } from '../../../services/globalevent.service';

import { Subscription } from 'rxjs';
import { Channel, DataStore } from '../../../services/slack/slack.types';

class DisplaySlackReactionInfo {
    constructor(public target: DisplaySlackMessageInfo, public rawReaction: string, public reaction: string, public users: string[]) {
    }

    addUser(user: string) {
        this.removeUser(user);
        this.users.push(user);
    }

    removeUser(user: string) {
        this.users = this.users.filter(u => u !== user);
    }

    get count(): number {
        return this.users.length;
    }

    get includeMine(): boolean {
        return !!(this.users.find(u => u === this.target.message.myUserId));
    }
}

export class DisplaySlackMessageInfo {
    edited: boolean = false;
    reactions: DisplaySlackReactionInfo[] = [];

    constructor(
        public message: SlackMessage,
        public parser: SlackParser,
        public client: SlackService
    ) {
    }

    get text(): string {
        return this.parser.parse(this.message.text, this.message.dataStore);
    }

    get attachments(): Attachment[] {
        return this.message.rawMessage.attachments
            ? this.message.rawMessage.attachments
            : [];
    }

    get doesReactionExist(): boolean {
        return this.reactions.length > 0;
    }

    addReaction(info: SlackReactionAdded) {
        const reaction = this.parser.parse(`:${info.reaction.reaction}:`, this.message.dataStore);
        const user = info.reaction.user;
        const target = this.reactions.find(r => r.reaction === reaction);

        if (target) {
            target.addUser(user);
        } else {
            this.reactions.push(new DisplaySlackReactionInfo(this, info.reaction.reaction, reaction, [user]));
        }
    }

    removeReaction(info: SlackReactionRemoved) {
        const reaction = this.parser.parse(`:${info.reaction.reaction}:`, this.message.dataStore);
        const target = this.reactions.find(r => r.reaction === reaction);

        if (target) {
            target.removeUser(info.reaction.user);

            if (target.count === 0) {
                this.reactions = this.reactions.filter(r => r.reaction !== reaction);
            }
        }
    }
}

interface SubmitContext {
    channel: Channel;
    dataStore: DataStore;
    teamID: string;

    extraInfo: string;
    initialText: string;

    emoji: EmojiService;

    submit(text: string): Promise<any>;
}

class PostMessageContext implements SubmitContext {
    constructor(
        public client: SlackService,
        public channel: Channel,
        public teamID: string,
        public infos: DisplaySlackMessageInfo[],
    ) {
    }

    get dataStore(): DataStore {
        return this.client.dataStore;
    }

    get emoji(): EmojiService {
        return this.client.emoji;
    }

    get lastMessageTs(): string {
        for (let i = 0; i < this.infos.length; i++) {
            if (this.infos[i].message.channelID === this.channel.id) {
                return this.infos[i].message.ts;
            }
        }
        return '';
    }

    get initialText(): string {
        return '';
    }

    get extraInfo(): string {
        return '';
    }

    async submit(text: string): Promise<any> {
        if (text.trim().match(/^\+:(.*):$/)) {
            let reaction = text.trim().match(/^\+:(.*):$/)[1];
            this.client.addReaction(reaction, this.channel.id, this.lastMessageTs);
        } else if (text.trim().match(/^\-:(.*):$/)) {
            let reaction = text.trim().match(/^\-:(.*):$/)[1];
            this.client.removeReaction(reaction, this.channel.id, this.lastMessageTs);
        } else {
            return this.client.postMessage(this.channel.id, text);
        }
    }
}

class EditMessageContext implements SubmitContext {
    constructor(
        public client: SlackService,
        public message: SlackMessage,
    ) {
    }

    get dataStore(): DataStore {
        return this.client.dataStore;
    }

    get emoji(): EmojiService {
        return this.client.emoji;
    }

    get channel(): Channel {
        return this.message.channel;
    }

    get channelName(): string {
        return this.message.channelName;
    }

    get channelID(): string {
        return this.message.channelID;
    }

    get teamID(): string {
        return this.message.teamID;
    }

    get initialText(): string {
        return this.message.text;
    }

    get extraInfo(): string {
        return '(editing)';
    }

    async submit(text: string): Promise<any> {
        return this.client.updateMessage(this.message.ts, this.message.channelID, text);
    }
}

interface FilterContext {
    soloMode: boolean;
    shouldShow(info: DisplaySlackMessageInfo): boolean;
}

class NoFilterContext implements FilterContext {
    get soloMode(): boolean {
        return false;
    }

    shouldShow(info: DisplaySlackMessageInfo): boolean {
        return true;
    }
}

class SoloChannelFilterContext implements FilterContext {
    constructor(private channel: string) {
    }

    get soloMode(): boolean {
        return true;
    }

    shouldShow(info: DisplaySlackMessageInfo): boolean {
        return info.message.channelID === this.channel;
    }
}


@Component({
    selector: 'ss-list',
    templateUrl: './slacklist.component.html',
    styles: [require('./slacklist.component.css').toString()],
})
export class SlackListComponent implements OnInit, OnDestroy {
    messages: DisplaySlackMessageInfo[] = [];
    slackServices: SlackService[];
    submitContext: SubmitContext = null;
    filterContext: FilterContext = new NoFilterContext();
    subscription = new Subscription();

    get soloMode(): boolean {
        return this.filterContext.soloMode;
    }

    get filteredMessages(): DisplaySlackMessageInfo[] {
        return this.messages.filter(m => this.filterContext.shouldShow(m));
    }

    get doesHaveMultipleTeams(): boolean {
        return this.slackServices.length >= 2;
    }

    get showTeamName(): boolean {
        return false;
    }

    constructor(
        private services: SlackServiceCollection,
        private events: GlobalEventService,
        private detector: ChangeDetectorRef,
        private router: Router
    ) {
        this.slackServices = services.slacks;
        this.messages = services.savedInfos;
    }

    ngOnInit(): void {
        if (this.slackServices.length === 0) {
            this.router.navigate(['/setting']);
            return;
        }

        this.services.refresh();

        for (const slack of this.slackServices) {
            const parser = new ComposedParser([
                new LinkParser(),
                new NewLineParser(),
                new EmojiParser(slack.emoji)
            ]);

            this.subscription.add(slack.messages.subscribe(message => this.onReceiveMessage(message, parser, slack)));
            this.subscription.add(slack.reactionAdded.subscribe(reaction => this.onReactionAdded(reaction, parser, slack)));
            this.subscription.add(slack.reactionRemoved.subscribe(reaction => this.onReactionRemoved(reaction, parser, slack)));
            slack.start();
        }

        this.subscription.add(this.events.activateMessageForm.subscribe(() => this.activateMessageForm()));
        this.subscription.add(this.events.keydown.filter(e => e.which === 38).subscribe(() => this.editLatestMessage()));
    }

    ngOnDestroy(): void {
        for (const slack of this.slackServices) {
            slack.stop();
        }
        this.services.savedInfos = this.messages;
        this.subscription.unsubscribe();
    }

    async onReactionAdded(reaction: SlackReactionAdded, parser: SlackParser, client: SlackService): Promise<void> {
        const target = this.messages.find(m => m.message.rawMessage.ts === reaction.reaction.item.ts);
        if (target) {
            target.addReaction(reaction);
        }
        console.log(reaction.reaction);
        this.detector.detectChanges();
    }

    async onReactionRemoved(reaction: SlackReactionAdded, parser: SlackParser, client: SlackService): Promise<void> {
        const target = this.messages.find(m => m.message.rawMessage.ts === reaction.reaction.item.ts);
        if (target) {
            target.removeReaction(reaction);
        }
        console.log(reaction.reaction);
        this.detector.detectChanges();
    }

    async onReceiveMessage(message: SlackMessage, parser: SlackParser, client: SlackService): Promise<void> {
        console.log(message.rawMessage);

        switch (message.rawMessage.subtype) {
            case 'message_deleted':
                await this.removeDeletedMessage(message, parser, client);
                break;
            case 'message_changed':
                await this.changeMessage(message, parser, client);
                break;
            case 'message_replied':
                await this.replyMessage(message, parser, client);
                break;
            default:
                await this.addMessage(message, parser, client);
                break;
        }

        this.detector.detectChanges();
    }

    async addMessage(message: SlackMessage, parser: SlackParser, client: SlackService): Promise<void> {
        if (message.message) {
            this.messages.unshift(new DisplaySlackMessageInfo(message, parser, client));
            client.markRead(message.channelID, message.ts);
        }
    }

    async deleteMessage(message: SlackMessage, client: SlackService): Promise<void> {
        if (message.message) {
            client.deleteMessage(message.channelID, message.ts);
        }
    }

    async replyMessage(message: SlackMessage, parser: SlackParser, client: SlackService): Promise<void> {
        // TODO
    }

    async removeDeletedMessage(message: SlackMessage, parser: SlackParser, client: SlackService): Promise<void> {
        this.messages = this.messages.filter(m => message.rawMessage.deleted_ts !== m.message.rawMessage.ts);
    }

    async changeMessage(message: SlackMessage, parser: SlackParser, client: SlackService): Promise<void> {
        const edited = this.messages.find(m => m.message.rawMessage.ts === message.rawMessage.message.ts);
        if (edited) {
            edited.edited = true;
            edited.message.text = message.rawMessage.message.text;
            edited.message.rawMessage.attachments = message.rawMessage.message.attachments;
        }
    }

    get showForm(): boolean {
        return this.submitContext != null;
    }

    onClickWrite(info: DisplaySlackMessageInfo) {
        this.submitContext = new PostMessageContext(
            info.client,
            info.message.channel,
            info.message.teamID,
            this.messages
        );
        this.detector.detectChanges();
    }

    onClickDelete(info: DisplaySlackMessageInfo) {
        this.deleteMessage(info.message, info.client);
    }

    onClickSoloMode(info: DisplaySlackMessageInfo) {
        if (this.filterContext.soloMode) {
            this.filterContext = new NoFilterContext();
        } else {
            this.filterContext = new SoloChannelFilterContext(info.message.channelID);
        }
        this.detector.detectChanges();
    }

    onClickEdit(info: DisplaySlackMessageInfo) {
        this.submitContext = new EditMessageContext(info.client, info.message);
        this.detector.detectChanges();
    }

    async submitForm(text: string) {
        if (this.submitContext != null) {
            await this.submitContext.submit(text);
            this.submitContext = null;
            this.detector.detectChanges();
        }
    }

    closeForm() {
        this.submitContext = null;
        this.detector.detectChanges();
    }

    onClickReaction(reaction: DisplaySlackReactionInfo) {
        const client = reaction.target.client;
        if (!reaction.includeMine) {
            client.addReaction(reaction.rawReaction, reaction.target.message.channelID, reaction.target.message.ts);
        } else {
            client.removeReaction(reaction.rawReaction, reaction.target.message.channelID, reaction.target.message.ts);
        }
    }

    activateMessageForm() {
        if(this.submitContext == null) {
            const messages = this.filteredMessages;
            if(messages.length != 0) {
                var message = messages[0];
                this.submitContext = new PostMessageContext(
                    message.client,
                    message.message.channel,
                    message.message.teamID,
                    messages
                );
                this.detector.detectChanges();
            }
        }
    }

    editLatestMessage() {
        for(const info of this.messages) {
            if (info.message.mine) {
                this.onClickEdit(info);
                return;
            }
        }
    }
}
