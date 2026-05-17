"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEventConvoFirstMessage = isEventConvoFirstMessage;
exports.validateEventConvoFirstMessage = validateEventConvoFirstMessage;
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.moderation.subscribeModEvents';
const hashEventConvoFirstMessage = 'eventConvoFirstMessage';
function isEventConvoFirstMessage(v) {
    return is$typed(v, id, hashEventConvoFirstMessage);
}
function validateEventConvoFirstMessage(v) {
    return validate(v, id, hashEventConvoFirstMessage);
}
//# sourceMappingURL=subscribeModEvents.js.map