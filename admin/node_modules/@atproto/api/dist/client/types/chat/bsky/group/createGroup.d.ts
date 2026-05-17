/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@atproto/xrpc';
import type * as ChatBskyConvoDefs from '../convo/defs.js';
export type QueryParams = {};
export interface InputSchema {
    members: string[];
    name: string;
}
export interface OutputSchema {
    convo: ChatBskyConvoDefs.ConvoView;
}
export interface CallOptions {
    signal?: AbortSignal;
    headers?: HeadersMap;
    qp?: QueryParams;
    encoding?: 'application/json';
}
export interface Response {
    success: boolean;
    headers: HeadersMap;
    data: OutputSchema;
}
export declare class AccountSuspendedError extends XRPCError {
    constructor(src: XRPCError);
}
export declare class BlockedActorError extends XRPCError {
    constructor(src: XRPCError);
}
export declare class GroupInvitesDisabledError extends XRPCError {
    constructor(src: XRPCError);
}
export declare class NotFollowedBySenderError extends XRPCError {
    constructor(src: XRPCError);
}
export declare class RecipientNotFoundError extends XRPCError {
    constructor(src: XRPCError);
}
export declare function toKnownErr(e: any): any;
//# sourceMappingURL=createGroup.d.ts.map