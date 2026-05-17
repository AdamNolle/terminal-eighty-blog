"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserKickedError = exports.MemberLimitReachedError = exports.LinkDisabledError = exports.InvalidCodeError = exports.FollowRequiredError = exports.ConvoLockedError = void 0;
exports.toKnownErr = toKnownErr;
/**
 * GENERATED CODE - DO NOT MODIFY
 */
const xrpc_1 = require("@atproto/xrpc");
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.group.requestJoin';
class ConvoLockedError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.ConvoLockedError = ConvoLockedError;
class FollowRequiredError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.FollowRequiredError = FollowRequiredError;
class InvalidCodeError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.InvalidCodeError = InvalidCodeError;
class LinkDisabledError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.LinkDisabledError = LinkDisabledError;
class MemberLimitReachedError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.MemberLimitReachedError = MemberLimitReachedError;
class UserKickedError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.UserKickedError = UserKickedError;
function toKnownErr(e) {
    if (e instanceof xrpc_1.XRPCError) {
        if (e.error === 'ConvoLocked')
            return new ConvoLockedError(e);
        if (e.error === 'FollowRequired')
            return new FollowRequiredError(e);
        if (e.error === 'InvalidCode')
            return new InvalidCodeError(e);
        if (e.error === 'LinkDisabled')
            return new LinkDisabledError(e);
        if (e.error === 'MemberLimitReached')
            return new MemberLimitReachedError(e);
        if (e.error === 'UserKicked')
            return new UserKickedError(e);
    }
    return e;
}
//# sourceMappingURL=requestJoin.js.map