// Pure authorization and expiration rules. No database or wall-clock dependencies.
export const DAY_MS = 86_400_000;
export const INACTIVITY_DAYS = 90;
export const INVITE_TYPES = Object.freeze(["player", "group", "gm"]);

export function isInactive(lastActiveAt, now, days = INACTIVITY_DAYS) {
  if (!lastActiveAt || !Number.isFinite(Date.parse(lastActiveAt))) return false;
  return now - Date.parse(lastActiveAt) >= days * DAY_MS;
}

export function canRevokeAdministrator(actor, target, administratorCount, now) {
  return !!actor?.is_admin && actor.id !== target?.id &&
    !!target?.is_admin && administratorCount > 1 &&
    isInactive(target.last_active_at, now);
}

export function canRecoverCampaignGM(actor, gmAccounts, now) {
  return !!actor?.is_admin && gmAccounts.length > 0 &&
    gmAccounts.every((gm) => isInactive(gm.last_active_at, now));
}

export function canReadCampaign(member) { return !!member; }
export function canManageCampaign(member) { return !!member?.is_gm; }
export function canReadResource(user, member, resource) {
  if (!user || !member || !resource || resource.is_test_data) return false;
  if (resource.visibility === "campaign") return true;
  if (resource.visibility === "gm") return !!member.is_gm;
  if (resource.visibility === "private") return resource.owner_id === user.id;
  return false;
}

export function normalizeCampaignName(value) {
  if (typeof value !== "string") throw new Error("Campaign name is required");
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Campaign name cannot contain control characters");
  const name = value.trim().normalize("NFC");
  if (!name || Array.from(name).length > 100 || /[\u0000-\u001f\u007f]/u.test(name))
    throw new Error("Campaign name must be 1–100 Unicode characters without control characters");
  return name;
}

export function invitationValid(invite, now) {
  return !!invite && !invite.revoked_at &&
    Date.parse(invite.expires_at) > now &&
    (invite.max_uses === null || invite.uses < invite.max_uses) &&
    INVITE_TYPES.includes(invite.kind);
}

export function invitationSpec(kind, expiresDays = 7, maxUses = 10) {
  if (!INVITE_TYPES.includes(kind)) throw new Error("Unknown invitation type");
  if (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 30)
    throw new Error("Expiration must be 1–30 days");
  if (kind !== "group") return {kind, expiresDays, maxUses: 1};
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100)
    throw new Error("Group invitation limit must be 1–100");
  return {kind, expiresDays, maxUses};
}

export function isTestName(value) { return typeof value === "string" && value.startsWith("test_"); }
