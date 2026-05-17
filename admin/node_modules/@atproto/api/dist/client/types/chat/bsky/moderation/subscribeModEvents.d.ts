import { type ValidationResult } from '@atproto/lexicon';
export interface EventConvoFirstMessage {
    $type?: 'chat.bsky.moderation.subscribeModEvents#eventConvoFirstMessage';
    convoId: string;
    createdAt: string;
    messageId?: string;
    /** The list of DIDs message recipients. Does not include the sender, which is in the `user` field */
    recipients: string[];
    rev: string;
    /** The DID of the message author. */
    user: string;
}
export declare function isEventConvoFirstMessage<V>(v: V): v is import("../../../../util").$TypedObject<V, "chat.bsky.moderation.subscribeModEvents", "eventConvoFirstMessage">;
export declare function validateEventConvoFirstMessage<V>(v: V): ValidationResult<EventConvoFirstMessage & V>;
//# sourceMappingURL=subscribeModEvents.d.ts.map