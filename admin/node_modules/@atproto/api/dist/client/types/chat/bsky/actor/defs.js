"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProfileViewBasic = isProfileViewBasic;
exports.validateProfileViewBasic = validateProfileViewBasic;
exports.isDirectConvoMember = isDirectConvoMember;
exports.validateDirectConvoMember = validateDirectConvoMember;
exports.isGroupConvoMember = isGroupConvoMember;
exports.validateGroupConvoMember = validateGroupConvoMember;
exports.isPastGroupConvoMember = isPastGroupConvoMember;
exports.validatePastGroupConvoMember = validatePastGroupConvoMember;
const lexicons_1 = require("../../../../lexicons");
const util_1 = require("../../../../util");
const is$typed = util_1.is$typed, validate = lexicons_1.validate;
const id = 'chat.bsky.actor.defs';
const hashProfileViewBasic = 'profileViewBasic';
function isProfileViewBasic(v) {
    return is$typed(v, id, hashProfileViewBasic);
}
function validateProfileViewBasic(v) {
    return validate(v, id, hashProfileViewBasic);
}
const hashDirectConvoMember = 'directConvoMember';
function isDirectConvoMember(v) {
    return is$typed(v, id, hashDirectConvoMember);
}
function validateDirectConvoMember(v) {
    return validate(v, id, hashDirectConvoMember);
}
const hashGroupConvoMember = 'groupConvoMember';
function isGroupConvoMember(v) {
    return is$typed(v, id, hashGroupConvoMember);
}
function validateGroupConvoMember(v) {
    return validate(v, id, hashGroupConvoMember);
}
const hashPastGroupConvoMember = 'pastGroupConvoMember';
function isPastGroupConvoMember(v) {
    return is$typed(v, id, hashPastGroupConvoMember);
}
function validatePastGroupConvoMember(v) {
    return validate(v, id, hashPastGroupConvoMember);
}
//# sourceMappingURL=defs.js.map