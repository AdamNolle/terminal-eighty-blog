/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult } from '@atproto/lexicon';
export interface Main {
    $type: 'chat.bsky.actor.declaration';
    allowIncoming: 'all' | 'none' | 'following' | (string & {});
    /** [NOTE: This is under active development and should be considered unstable while this note is here]. Declaration about group chat invitation preferences for the record owner. */
    allowGroupInvites?: 'all' | 'none' | 'following' | (string & {});
    [k: string]: unknown;
}
export declare function isMain<V>(v: V): v is import("../../../../util").$TypedObject<V, "chat.bsky.actor.declaration", "main">;
export declare function validateMain<V>(v: V): ValidationResult<Main & V>;
export { type Main as Record, isMain as isRecord, validateMain as validateRecord, };
//# sourceMappingURL=declaration.d.ts.map