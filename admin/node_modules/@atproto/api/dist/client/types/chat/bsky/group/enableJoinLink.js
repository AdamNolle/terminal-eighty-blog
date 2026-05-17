"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkAlreadyEnabledError = exports.NoJoinLinkError = exports.InsufficientRoleError = exports.InvalidConvoError = void 0;
exports.toKnownErr = toKnownErr;
/**
 * GENERATED CODE - DO NOT MODIFY
 */
const xrpc_1 = require("@atproto/xrpc");
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.group.enableJoinLink';
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
class NoJoinLinkError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.NoJoinLinkError = NoJoinLinkError;
class LinkAlreadyEnabledError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.LinkAlreadyEnabledError = LinkAlreadyEnabledError;
function toKnownErr(e) {
    if (e instanceof xrpc_1.XRPCError) {
        if (e.error === 'InvalidConvo')
            return new InvalidConvoError(e);
        if (e.error === 'InsufficientRole')
            return new InsufficientRoleError(e);
        if (e.error === 'NoJoinLink')
            return new NoJoinLinkError(e);
        if (e.error === 'LinkAlreadyEnabled')
            return new LinkAlreadyEnabledError(e);
    }
    return e;
}
//# sourceMappingURL=enableJoinLink.js.map