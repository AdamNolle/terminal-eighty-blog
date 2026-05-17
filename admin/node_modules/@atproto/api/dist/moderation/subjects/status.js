"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideStatus = decideStatus;
const decision_1 = require("../decision");
const account_1 = require("./account");
const profile_1 = require("./profile");
function decideStatus(subject, opts) {
    const acc = new decision_1.ModerationDecision();
    acc.setDid(subject.did);
    acc.setIsMe(subject.did === opts.userDid);
    if ('status' in subject) {
        if (subject.status?.labels?.length) {
            for (const label of subject.status.labels) {
                acc.addLabel('content', label, opts);
            }
        }
    }
    return decision_1.ModerationDecision.merge(acc, (0, account_1.decideAccount)(subject, opts), (0, profile_1.decideProfile)(subject, opts));
}
//# sourceMappingURL=status.js.map