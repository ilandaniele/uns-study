import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backChatView,
  chatWidgetReducer,
  closeChatWidget,
  getChatWidgetState,
  initialChatWidgetState,
  openChatWidget,
  pushChatView,
  resetChatWidget,
  subscribeChatWidget,
  topView,
  viewKey,
  type ChatWidgetState,
} from "./widget-store";

const dm = (id: string) => ({ kind: "dm", conversationId: id }) as const;
const group = (id: string) => ({ kind: "group", groupId: id }) as const;
const keys = (s: ChatWidgetState) => s.stack.map(viewKey);
const opened = (): ChatWidgetState => chatWidgetReducer(initialChatWidgetState, { type: "open" });

describe("chatWidgetReducer", () => {
  it("starts closed on [list, room]", () => {
    expect(initialChatWidgetState.open).toBe(false);
    expect(keys(initialChatWidgetState)).toEqual(["list", "room"]);
  });

  it("open() from closed lands on the room with direction none", () => {
    const s = opened();
    expect(s.open).toBe(true);
    expect(keys(s)).toEqual(["list", "room"]);
    expect(s.direction).toBe("none");
  });

  it("open() when already open is a no-op", () => {
    const s = opened();
    expect(chatWidgetReducer(s, { type: "open" })).toBe(s);
  });

  it("open() resets to [list, room] even after a dm was left open", () => {
    const s = chatWidgetReducer(initialChatWidgetState, { type: "open", view: dm("a") });
    const closed = chatWidgetReducer(s, { type: "close" });
    expect(keys(chatWidgetReducer(closed, { type: "open" }))).toEqual(["list", "room"]);
  });

  it("open(list) gives [list]; open(dm) gives [list, dm]; open(group) gives [list, group]", () => {
    expect(keys(chatWidgetReducer(initialChatWidgetState, { type: "open", view: { kind: "list" } }))).toEqual(["list"]);
    const d = chatWidgetReducer(initialChatWidgetState, { type: "open", view: dm("a") });
    expect(keys(d)).toEqual(["list", "dm:a"]);
    expect(d.direction).toBe("none");
    expect(keys(chatWidgetReducer(initialChatWidgetState, { type: "open", view: group("g") }))).toEqual(["list", "group:g"]);
  });

  it("open(view) while open is forward; open(room) rebuilds [list, room]", () => {
    const s = chatWidgetReducer(opened(), { type: "open", view: dm("a") });
    expect(s.direction).toBe("forward");
    expect(keys(chatWidgetReducer(s, { type: "open", view: { kind: "room" } }))).toEqual(["list", "room"]);
  });

  it("open of the same top view when already open returns the same ref", () => {
    const s = chatWidgetReducer(initialChatWidgetState, { type: "open", view: dm("a") });
    expect(chatWidgetReducer(s, { type: "open", view: dm("a") })).toBe(s);
  });

  it("push is ignored when closed", () => {
    expect(chatWidgetReducer(initialChatWidgetState, { type: "push", view: dm("a") })).toBe(initialChatWidgetState);
  });

  it("push of the same top returns the same ref", () => {
    const s = chatWidgetReducer(opened(), { type: "push", view: dm("a") });
    expect(chatWidgetReducer(s, { type: "push", view: dm("a") })).toBe(s);
  });

  it("push dm from the room gives [list, room, dm], and back returns to the room", () => {
    const s = chatWidgetReducer(opened(), { type: "push", view: dm("a") });
    expect(keys(s)).toEqual(["list", "room", "dm:a"]);
    expect(s.direction).toBe("forward");
    const back = chatWidgetReducer(s, { type: "back" });
    expect(topView(back)).toEqual({ kind: "room" });
    expect(back.direction).toBe("back");
  });

  it("push dm over dm replaces the top", () => {
    let s = chatWidgetReducer(opened(), { type: "push", view: dm("a") });
    s = chatWidgetReducer(s, { type: "push", view: dm("b") });
    expect(keys(s)).toEqual(["list", "room", "dm:b"]);
  });

  it("push group over new-group replaces it", () => {
    let s = chatWidgetReducer(chatWidgetReducer(opened(), { type: "back" }), { type: "push", view: { kind: "new-group" } });
    expect(keys(s)).toEqual(["list", "new-group"]);
    s = chatWidgetReducer(s, { type: "push", view: group("g") });
    expect(keys(s)).toEqual(["list", "group:g"]);
  });

  it("push dm over group (and group over dm) replaces it", () => {
    let s = chatWidgetReducer(initialChatWidgetState, { type: "open", view: group("g") });
    s = chatWidgetReducer(s, { type: "push", view: dm("a") });
    expect(keys(s)).toEqual(["list", "dm:a"]);
    s = chatWidgetReducer(s, { type: "push", view: group("g") });
    expect(keys(s)).toEqual(["list", "group:g"]);
  });

  it("push room from [list, room, dm] truncates to [list, room] with direction back", () => {
    const s = chatWidgetReducer(chatWidgetReducer(opened(), { type: "push", view: dm("a") }), { type: "push", view: { kind: "room" } });
    expect(keys(s)).toEqual(["list", "room"]);
    expect(s.direction).toBe("back");
  });

  it("push list truncates to [list]", () => {
    const s = chatWidgetReducer(opened(), { type: "push", view: { kind: "list" } });
    expect(keys(s)).toEqual(["list"]);
    expect(s.direction).toBe("back");
  });

  it("push new-group from the list appends", () => {
    const list = chatWidgetReducer(opened(), { type: "back" });
    const s = chatWidgetReducer(list, { type: "push", view: { kind: "new-group" } });
    expect(keys(s)).toEqual(["list", "new-group"]);
    expect(s.direction).toBe("forward");
  });

  it("back from the room gives [list] with direction back; back at [list] returns the same ref", () => {
    const s = chatWidgetReducer(opened(), { type: "back" });
    expect(keys(s)).toEqual(["list"]);
    expect(s.direction).toBe("back");
    expect(chatWidgetReducer(s, { type: "back" })).toBe(s);
  });

  it("close keeps the stack; close when closed returns the same ref", () => {
    const s = chatWidgetReducer(initialChatWidgetState, { type: "open", view: dm("a") });
    const closed = chatWidgetReducer(s, { type: "close" });
    expect(closed.open).toBe(false);
    expect(closed.direction).toBe("none");
    expect(closed.stack).toBe(s.stack);
    expect(chatWidgetReducer(closed, { type: "close" })).toBe(closed);
  });

  it("reset returns the initial state", () => {
    const s = chatWidgetReducer(initialChatWidgetState, { type: "open", view: dm("a") });
    expect(chatWidgetReducer(s, { type: "reset" })).toBe(initialChatWidgetState);
  });
});

describe("selectors", () => {
  it("viewKey and topView", () => {
    expect(viewKey({ kind: "room" })).toBe("room");
    expect(viewKey({ kind: "list" })).toBe("list");
    expect(viewKey(dm("x"))).toBe("dm:x");
    expect(viewKey(group("g"))).toBe("group:g");
    expect(viewKey({ kind: "new-group" })).toBe("new-group");
    expect(topView(initialChatWidgetState)).toEqual({ kind: "room" });
  });
});

describe("imperative API", () => {
  beforeEach(() => resetChatWidget());

  it("notifies a subscriber once per real change and not on a no-op", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeChatWidget(listener);
    openChatWidget();
    expect(listener).toHaveBeenCalledTimes(1);
    openChatWidget();
    expect(listener).toHaveBeenCalledTimes(1);
    pushChatView({ kind: "list" });
    pushChatView({ kind: "list" });
    expect(listener).toHaveBeenCalledTimes(2);
    backChatView();
    expect(listener).toHaveBeenCalledTimes(2);
    pushChatView({ kind: "new-group" });
    expect(listener).toHaveBeenCalledTimes(3);
    backChatView();
    expect(listener).toHaveBeenCalledTimes(4);
    closeChatWidget();
    closeChatWidget();
    expect(listener).toHaveBeenCalledTimes(5);
    unsubscribe();
    openChatWidget({ view: "dm", conversationId: "a" });
    expect(listener).toHaveBeenCalledTimes(5);
    expect(topView(getChatWidgetState())).toEqual({ kind: "dm", conversationId: "a" });
    openChatWidget({ view: "group", groupId: "g" });
    expect(topView(getChatWidgetState())).toEqual({ kind: "group", groupId: "g" });
  });
});
