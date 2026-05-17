"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactionInvalidValueError = exports.ReactionMessageDeletedError = exports.ReactionNotAllowedError = exports.InvalidConvoError = void 0;
exports.toKnownErr = toKnownErr;
/**
 * GENERATED CODE - DO NOT MODIFY
 */
const xrpc_1 = require("@atproto/xrpc");
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.convo.removeReaction';
class InvalidConvoError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.InvalidConvoError = InvalidConvoError;
class ReactionNotAllowedError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.ReactionNotAllowedError = ReactionNotAllowedError;
class ReactionMessageDeletedError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.ReactionMessageDeletedError = ReactionMessageDeletedError;
class ReactionInvalidValueError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.ReactionInvalidValueError = ReactionInvalidValueError;
function toKnownErr(e) {
    if (e instanceof xrpc_1.XRPCError) {
        if (e.error === 'InvalidConvo')
            return new InvalidConvoError(e);
        if (e.error === 'ReactionNotAllowed')
            return new ReactionNotAllowedError(e);
        if (e.error === 'ReactionMessageDeleted')
            return new ReactionMessageDeletedError(e);
        if (e.error === 'ReactionInvalidValue')
            return new ReactionInvalidValueError(e);
    }
    return e;
}
//# sourceMappingURL=removeReaction.js.map