"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemberLimitReachedError = exports.InsufficientRoleError = exports.InvalidConvoError = void 0;
exports.toKnownErr = toKnownErr;
/**
 * GENERATED CODE - DO NOT MODIFY
 */
const xrpc_1 = require("@atproto/xrpc");
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.group.approveJoinRequest';
class InvalidConvoError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.InvalidConvoError = InvalidConvoError;
class InsufficientRoleError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.InsufficientRoleError = InsufficientRoleError;
class MemberLimitReachedError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.MemberLimitReachedError = MemberLimitReachedError;
function toKnownErr(e) {
    if (e instanceof xrpc_1.XRPCError) {
        if (e.error === 'InvalidConvo')
            return new InvalidConvoError(e);
        if (e.error === 'InsufficientRole')
            return new InsufficientRoleError(e);
        if (e.error === 'MemberLimitReached')
            return new MemberLimitReachedError(e);
    }
    return e;
}
//# sourceMappingURL=approveJoinRequest.js.map