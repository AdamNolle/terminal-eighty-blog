"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecipientNotFoundError = exports.NotFollowedBySenderError = exports.MessagesDisabledError = exports.BlockedActorError = exports.AccountSuspendedError = void 0;
exports.toKnownErr = toKnownErr;
/**
 * GENERATED CODE - DO NOT MODIFY
 */
const xrpc_1 = require("@atproto/xrpc");
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.convo.getConvoForMembers';
class AccountSuspendedError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.AccountSuspendedError = AccountSuspendedError;
class BlockedActorError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.BlockedActorError = BlockedActorError;
class MessagesDisabledError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.MessagesDisabledError = MessagesDisabledError;
class NotFollowedBySenderError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.NotFollowedBySenderError = NotFollowedBySenderError;
class RecipientNotFoundError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.RecipientNotFoundError = RecipientNotFoundError;
function toKnownErr(e) {
    if (e instanceof xrpc_1.XRPCError) {
        if (e.error === 'AccountSuspended')
            return new AccountSuspendedError(e);
        if (e.error === 'BlockedActor')
            return new BlockedActorError(e);
        if (e.error === 'MessagesDisabled')
            return new MessagesDisabledError(e);
        if (e.error === 'NotFollowedBySender')
            return new NotFollowedBySenderError(e);
        if (e.error === 'RecipientNotFound')
            return new RecipientNotFoundError(e);
    }
    return e;
}
//# sourceMappingURL=getConvoForMembers.js.map