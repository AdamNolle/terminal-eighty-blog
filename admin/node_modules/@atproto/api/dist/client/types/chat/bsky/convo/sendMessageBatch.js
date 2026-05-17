"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidConvoError = exports.ConvoLockedError = void 0;
exports.toKnownErr = toKnownErr;
exports.isBatchItem = isBatchItem;
exports.validateBatchItem = validateBatchItem;
/**
 * GENERATED CODE - DO NOT MODIFY
 */
const xrpc_1 = require("@atproto/xrpc");
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.convo.sendMessageBatch';
class ConvoLockedError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.ConvoLockedError = ConvoLockedError;
class InvalidConvoError extends xrpc_1.XRPCError {
    constructor(src) {
        super(src.status, src.error, src.message, src.headers, { cause: src });
    }
}
exports.InvalidConvoError = InvalidConvoError;
function toKnownErr(e) {
    if (e instanceof xrpc_1.XRPCError) {
        if (e.error === 'ConvoLocked')
            return new ConvoLockedError(e);
        if (e.error === 'InvalidConvo')
            return new InvalidConvoError(e);
    }
    return e;
}
const hashBatchItem = 'batchItem';
function isBatchItem(v) {
    return is$typed(v, id, hashBatchItem);
}
function validateBatchItem(v) {
    return validate(v, id, hashBatchItem);
}
//# sourceMappingURL=sendMessageBatch.js.map