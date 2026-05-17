"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsufficientRoleError = exports.InvalidConvoError = exports.EnabledJoinLinkAlreadyExistsError = void 0;
exports.toKnownErr = toKnownErr;
/**
 * GENERATED CODE - DO NOT MODIFY
 */
const xrpc_1 = require("@atproto/xrpc");
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.group.createJoinLink';
class EnabledJoinLinkAlreadyExistsError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.EnabledJoinLinkAlreadyExistsError = EnabledJoinLinkAlreadyExistsError;
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
function toKnownErr(e) {
    if (e instanceof xrpc_1.XRPCError) {
        if (e.error === 'EnabledJoinLinkAlreadyExists')
            return new EnabledJoinLinkAlreadyExistsError(e);
        if (e.error === 'InvalidConvo')
            return new InvalidConvoError(e);
        if (e.error === 'InsufficientRole')
            return new InsufficientRoleError(e);
    }
    return e;
}
//# sourceMappingURL=createJoinLink.js.map