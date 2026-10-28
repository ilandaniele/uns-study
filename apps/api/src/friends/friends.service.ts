import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import { FRIEND_REQUEST_COOLDOWN_MS, FRIENDS_PAGE_SIZE, type FriendStateDto, type FriendshipDto, type FriendsPageDto, type FriendsView, type FriendTarget, type Page, type PersonSearchDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { Clock } from "../platform/clock.js";
import type { RealtimeHub } from "../realtime/realtime-hub.js";
import { AliasService } from "../users/alias.service.js";
import { displayName, needsAlias, visibleAvatarUrl } from "../users/display-name.js";

type Edge = typeof schema.friendships.$inferSelect;
type Identity = { user: typeof schema.user.$inferSelect; profile: typeof schema.userProfiles.$inferSelect; privacy: typeof schema.userPrivacySettings.$inferSelect | null };
type Snapshot = { identities: Map<string, Identity>; edges: Edge[]; blocked: Set<string>; restricted: Set<string> };

/** Mutual relationships. Decisions after an await run in a synchronous SQLite transaction. */
export class FriendsService {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly hub: RealtimeHub, private readonly aliases: AliasService) {}

  private unavailable(userId: string): boolean {
    return Boolean(this.db.select({ id: schema.userRestrictions.id }).from(schema.userRestrictions).where(and(
      eq(schema.userRestrictions.userId, userId), inArray(schema.userRestrictions.type, ["SUSPENDED", "BANNED"]),
      isNull(schema.userRestrictions.liftedAt), or(isNull(schema.userRestrictions.until), gt(schema.userRestrictions.until, this.clock.now())),
    )).get());
  }

  private actor(userId: string) {
    const user = this.db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
    if (!user?.emailVerified) throw ApiErrors.unauthenticated();
    if (this.unavailable(userId)) throw ApiErrors.restricted();
    return user;
  }

  private blocked(a: string, b: string): boolean {
    return Boolean(this.db.select().from(schema.userBlocks).where(or(
      and(eq(schema.userBlocks.blockerId, a), eq(schema.userBlocks.blockedId, b)),
      and(eq(schema.userBlocks.blockerId, b), eq(schema.userBlocks.blockedId, a)),
    )).get());
  }

  private pair(a: string, b: string): Edge | undefined {
    const [lower, upper] = [a, b].sort() as [string, string];
    return this.db.select().from(schema.friendships).where(and(eq(schema.friendships.lowerUserId, lower), eq(schema.friendships.upperUserId, upper))).get();
  }

  private identity(userId: string) {
    return this.db.select({ user: schema.user, profile: schema.userProfiles, privacy: schema.userPrivacySettings })
      .from(schema.user).innerJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.user.id))
      .leftJoin(schema.userPrivacySettings, eq(schema.userPrivacySettings.userId, schema.user.id)).where(eq(schema.user.id, userId)).get();
  }

  private resolve(actorId: string, target: FriendTarget): string {
    const profile = target.kind === "alias"
      ? this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.aliasLower, target.alias.trim().toLowerCase())).get()
      : this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, target.userId)).get();
    if (!profile || (target.kind === "alias" ? !needsAlias(profile) : needsAlias(profile))) throw ApiErrors.notFound("Perfil no disponible.");
    const data = this.identity(profile.userId);
    if (!data?.user.emailVerified || this.unavailable(profile.userId) || this.blocked(actorId, profile.userId)) throw ApiErrors.notFound("Perfil no disponible.");
    return profile.userId;
  }

  private status(actorId: string, otherId: string, edge: Edge | undefined, receivesRequests?: boolean): FriendStateDto {
    if (actorId === otherId) return { state: "SELF", friendshipId: null, canRequest: false, retryAt: null };
    const retry = edge?.status === "CLOSED" ? edge.updatedAt.getTime() + FRIEND_REQUEST_COOLDOWN_MS : 0;
    const state = edge?.status === "ACCEPTED" ? "FRIENDS" : edge?.status === "PENDING" ? edge.requestedBy === actorId ? "OUTGOING" : "INCOMING" : "NONE";
    const allowed = receivesRequests ?? this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, otherId)).get()?.allowFriendRequests ?? true;
    return { state, friendshipId: state === "NONE" ? null : edge?.id ?? null,
      canRequest: state === "NONE" && allowed && retry <= this.clock.now().getTime(),
      retryAt: state === "NONE" && retry > this.clock.now().getTime() ? new Date(retry).toISOString() : null };
  }

  state(actorId: string, target: FriendTarget): FriendStateDto {
    this.actor(actorId);
    if (target.kind === "user" && target.userId === actorId) return this.status(actorId, actorId, undefined);
    const otherId = this.resolve(actorId, target);
    return this.status(actorId, otherId, this.pair(actorId, otherId));
  }

  private snapshot(actorId: string, directory: boolean): Snapshot {
    const edges = this.db.select().from(schema.friendships).where(or(eq(schema.friendships.lowerUserId, actorId), eq(schema.friendships.upperUserId, actorId)))
      .orderBy(schema.friendships.createdAt, schema.friendships.id).all();
    const ids = [...new Set(edges.filter(e => e.status !== "CLOSED").map(e => e.lowerUserId === actorId ? e.upperUserId : e.lowerUserId))];
    const joined = () => this.db.select({ user: schema.user, profile: schema.userProfiles, privacy: schema.userPrivacySettings }).from(schema.user)
      .innerJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.user.id))
      .leftJoin(schema.userPrivacySettings, eq(schema.userPrivacySettings.userId, schema.user.id));
    const rows = directory ? joined().orderBy(schema.user.id).all() : inChunks(ids, part => joined().where(inArray(schema.user.id, part)).all());
    const blocks = this.db.select().from(schema.userBlocks).where(or(eq(schema.userBlocks.blockerId, actorId), eq(schema.userBlocks.blockedId, actorId))).all();
    const restricted = this.db.select({ id: schema.userRestrictions.userId }).from(schema.userRestrictions).where(and(
      inArray(schema.userRestrictions.type, ["SUSPENDED", "BANNED"]), isNull(schema.userRestrictions.liftedAt),
      or(isNull(schema.userRestrictions.until), gt(schema.userRestrictions.until, this.clock.now())),
    )).all();
    return { edges, identities: new Map(rows.map(row => [row.user.id, row])), blocked: new Set(blocks.map(b => b.blockerId === actorId ? b.blockedId : b.blockerId)), restricted: new Set(restricted.map(r => r.id)) };
  }

  private person(actorId: string, otherId: string, edge: Edge | undefined, snapshot: Snapshot): PersonSearchDto | null {
    const data = snapshot.identities.get(otherId);
    if (!data?.user.emailVerified || snapshot.restricted.has(otherId) || snapshot.blocked.has(otherId)) return null;
    const { profile, privacy } = data;
    const forcedAlias = edge && (edge.lowerUserId === otherId ? edge.lowerAliasOnly : edge.upperAliasOnly);
    const anonymous = needsAlias(profile) || forcedAlias;
    if (anonymous && !profile.alias) return null;
    const target: FriendTarget = anonymous ? { kind: "alias", alias: profile.alias! } : { kind: "user", userId: otherId };
    return { target, displayName: anonymous ? profile.alias! : displayName(profile, privacy, ""),
      avatarUrl: anonymous ? null : visibleAvatarUrl(profile, privacy),
      aliasAnimal: anonymous && privacy?.showAliasAnimalOnMap !== false ? profile.aliasAnimal : null,
      career: !anonymous && privacy?.showCareer ? profile.career : null,
      profileHref: anonymous ? needsAlias(profile) ? `/alias/${encodeURIComponent(profile.alias!)}` : null : `/u/${encodeURIComponent(otherId)}`,
      adminBadge: false, friendship: this.status(actorId, otherId, edge, privacy?.allowFriendRequests ?? true) };
  }

  search(actorId: string, query: string, cursor = "0"): Page<PersonSearchDto> {
    this.actor(actorId);
    const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-AR");
    const needle = fold(query.trim());
    if (needle.length < 2 || query.length > 80) throw ApiErrors.validation("Escribí entre 2 y 80 caracteres.");
    const snapshot = this.snapshot(actorId, true);
    const edges = new Map(snapshot.edges.map(edge => [edge.lowerUserId === actorId ? edge.upperUserId : edge.lowerUserId, edge]));
    const matches: PersonSearchDto[] = [];
    for (const row of snapshot.identities.values()) {
      if (row.user.id === actorId || row.privacy?.showInPeopleSearch === false) continue;
      const person = this.person(actorId, row.user.id, edges.get(row.user.id), snapshot);
      // Match the chosen display only, never hidden names, email, student number or bio.
      if (person && fold(person.displayName).includes(needle)) matches.push(person);
    }
    const start = Number(cursor);
    return { items: matches.slice(start, start + FRIENDS_PAGE_SIZE), nextCursor: matches.length > start + FRIENDS_PAGE_SIZE ? String(start + FRIENDS_PAGE_SIZE) : null };
  }

  list(actorId: string, view: FriendsView, cursor = "0", query = ""): FriendsPageDto {
    this.actor(actorId);
    const snapshot = this.snapshot(actorId, false);
    const groups: Record<FriendsView, FriendshipDto[]> = { friends: [], incoming: [], outgoing: [] };
    for (const edge of snapshot.edges) {
      if (edge.status === "CLOSED") continue;
      const person = this.person(actorId, edge.lowerUserId === actorId ? edge.upperUserId : edge.lowerUserId, edge, snapshot);
      if (!person) continue;
      const category = edge.status === "ACCEPTED" ? "friends" : edge.requestedBy === actorId ? "outgoing" : "incoming";
      groups[category].push({ id: edge.id, person, createdAt: edge.createdAt.toISOString() });
    }
    const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-AR");
    const start = Number(cursor), items = groups[view].filter(item => fold(item.person.displayName).includes(fold(query.trim())));
    return { items: items.slice(start, start + FRIENDS_PAGE_SIZE), nextCursor: items.length > start + FRIENDS_PAGE_SIZE ? String(start + FRIENDS_PAGE_SIZE) : null,
      counts: { friends: groups.friends.length, incoming: groups.incoming.length, outgoing: groups.outgoing.length } };
  }

  private changed(edge: Edge): void {
    this.hub.publishToUser(edge.lowerUserId, "friends:changed", {});
    this.hub.publishToUser(edge.upperUserId, "friends:changed", {});
  }

  async request(actorId: string, target: FriendTarget): Promise<FriendStateDto> {
    this.actor(actorId);
    this.db.insert(schema.userProfiles).values({ userId: actorId }).onConflictDoNothing().run();
    await this.aliases.ensureAlias(actorId);
    let changed: Edge | undefined;
    const result = this.db.transaction(() => {
      this.actor(actorId);
      const otherId = this.resolve(actorId, target);
      if (otherId === actorId) throw ApiErrors.validation("No podés agregarte a vos mismo.");
      const prior = this.pair(actorId, otherId);
      const status = this.status(actorId, otherId, prior);
      if (status.state !== "NONE") return status;
      if (!status.canRequest) throw ApiErrors.forbidden(status.retryAt ? "Esperá 24 horas antes de enviar otra solicitud a esta persona." : "Esta persona no recibe solicitudes de amistad.");
      const [lower, upper] = [actorId, otherId].sort() as [string, string];
      const now = this.clock.now();
      const values: Edge = { id: crypto.randomUUID(), lowerUserId: lower, upperUserId: upper, requestedBy: actorId,
        status: "PENDING", lowerAliasOnly: needsAlias(this.identity(lower)!.profile) || prior?.lowerAliasOnly === true,
        upperAliasOnly: needsAlias(this.identity(upper)!.profile) || prior?.upperAliasOnly === true, createdAt: now, updatedAt: now };
      if (prior) this.db.update(schema.friendships).set(values).where(eq(schema.friendships.id, prior.id)).run();
      else this.db.insert(schema.friendships).values(values).run();
      changed = values;
      return this.status(actorId, otherId, values);
    });
    if (changed) this.changed(changed);
    return result;
  }

  respond(actorId: string, id: string, action: "ACCEPT" | "DECLINE"): void {
    const changed = this.db.transaction(() => {
      this.actor(actorId);
      const edge = this.db.select().from(schema.friendships).where(eq(schema.friendships.id, id)).get();
      if (!edge || (edge.lowerUserId !== actorId && edge.upperUserId !== actorId) || edge.requestedBy === actorId) throw ApiErrors.notFound();
      if (this.blocked(actorId, edge.requestedBy) || this.unavailable(edge.requestedBy)) throw ApiErrors.notFound();
      if (edge.status !== "PENDING") return null;
      this.db.update(schema.friendships).set({ status: action === "ACCEPT" ? "ACCEPTED" : "CLOSED", updatedAt: this.clock.now() }).where(eq(schema.friendships.id, id)).run();
      return edge;
    });
    if (changed) this.changed(changed);
  }

  remove(actorId: string, id: string): void {
    const changed = this.db.transaction(() => {
      this.actor(actorId);
      const edge = this.db.select().from(schema.friendships).where(eq(schema.friendships.id, id)).get();
      if (!edge || (edge.lowerUserId !== actorId && edge.upperUserId !== actorId) || (edge.status === "PENDING" && edge.requestedBy !== actorId)) throw ApiErrors.notFound();
      if (edge.status === "CLOSED") return null;
      this.db.update(schema.friendships).set({ status: "CLOSED", updatedAt: this.clock.now() }).where(eq(schema.friendships.id, id)).run();
      return edge;
    });
    if (changed) this.changed(changed);
  }

  /** Resolve a contact for the block service without exposing a hidden account id to the client. */
  memberForBlock(actorId: string, id: string): string {
    this.actor(actorId);
    const edge = this.db.select().from(schema.friendships).where(eq(schema.friendships.id, id)).get();
    if (!edge || (edge.lowerUserId !== actorId && edge.upperUserId !== actorId)) throw ApiErrors.notFound();
    return edge.lowerUserId === actorId ? edge.upperUserId : edge.lowerUserId;
  }
}
