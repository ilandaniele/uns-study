import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backChatView,
  chatWidgetReducer,
  closeChatWidget,
  getChatWidgetState,
  initialChatWidgetState,
  openChatWidget,
  openDmId,
  pushChatView,
  resetChatWidget,
  subscribeChatWidget,
  topView,
  viewKey,
  type ChatWidgetState,
} from "./widget-store";

const dm = (id: string) => ({ kind: "dm", conversationId: id }) as const;
const opened = (): ChatWidgetState => chatWidgetReducer(initialChatWidgetState, { type: "open" });

describe("chatWidgetReducer", () => {
  it("open() from closed keeps the stack and sets direction none", () => {
    const s = opened();
    expect(s.open).toBe(true);
    expect(s.stack).toBe(initialChatWidgetState.stack);
    expect(s.direction).toBe("none");
  });

  it("open() when already open is a no-op", () => {
    const s = opened();
    expect(chatWidgetReducer(s, { type: "open" })).toBe(s);
  });

  it("open(dm) builds [room, list, dm] with direction none when closed", () => {
    const s = chatWidgetReducer(initialChatWidgetState, { type: "open", view: dm("a") });
    expect(s.stack.map(viewKey)).toEqual(["room", "list", "dm:a"]);
    expect(s.direction).toBe("none");
  });

  it("open(dm) while open is forward; open(list) and open(room) rebuild the stack", () => {
    const s = chatWidgetReducer(opened(), { type: "open", view: dm("a") });
    expect(s.direction).toBe("forward");
    expect(chatWidgetReducer(s, { type: "open", view: { kind: "list" } }).stack.map(viewKey)).toEqual(["room", "list"]);
    expect(chatWidgetReducer(s, { type: "open", view: { kind: "room" } }).stack.map(viewKey)).toEqual(["room"]);
  });

  it("open of the same view when already open returns the same ref", () => {
    const s = chatWidgetReducer(initialChatWidgetState, { type: "open", view: dm("a") });
    expect(chatWidgetReducer(s, { type: "open", view: dm("a") })).toBe(s);
  });

  it("push is ignored when closed", () => {
    expect(chatWidgetReducer(initialChatWidgetState, { type: "push", view: { kind: "list" } })).toBe(initialChatWidgetState);
  });

  it("push of the same top returns the same ref", () => {
    const s = chatWidgetReducer(opened(), { type: "push", view: { kind: "list" } });
    expect(chatWidgetReducer(s, { type: "push", view: { kind: "list" } })).toBe(s);
  });

  it("push appends and sets forward", () => {
    const s = chatWidgetReducer(opened(), { type: "push", view: { kind: "list" } });
    expect(s.stack.map(viewKey)).toEqual(["room", "list"]);
    expect(s.direction).toBe("forward");
  });

  it("push dm over dm replaces the top", () => {
    let s = chatWidgetReducer(opened(), { type: "push", view: { kind: "list" } });
    s = chatWidgetReducer(s, { type: "push", view: dm("a") });
    s = chatWidgetReducer(s, { type: "push", view: dm("b") });
    expect(s.stack.map(viewKey)).toEqual(["room", "list", "dm:b"]);
  });

  it("back pops and sets back", () => {
    const s = chatWidgetReducer(chatWidgetReducer(opened(), { type: "push", view: { kind: "list" } }), { type: "back" });
    expect(s.stack.map(viewKey)).toEqual(["room"]);
    expect(s.direction).toBe("back");
  });

  it("back at root returns the same ref", () => {
    const s = opened();
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
  it("openDmId is null when closed or the top is not a dm", () => {
    const s = chatWidgetReducer(initialChatWidgetState, { type: "open", view: dm("a") });
    expect(openDmId(s)).toBe("a");
    expect(openDmId(chatWidgetReducer(s, { type: "close" }))).toBeNull();
    expect(openDmId(chatWidgetReducer(s, { type: "back" }))).toBeNull();
  });

  it("viewKey and topView", () => {
    expect(viewKey({ kind: "room" })).toBe("room");
    expect(viewKey({ kind: "list" })).toBe("list");
    expect(viewKey(dm("x"))).toBe("dm:x");
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
    backChatView();
    expect(listener).toHaveBeenCalledTimes(3);
    closeChatWidget();
    closeChatWidget();
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    openChatWidget({ view: "dm", conversationId: "a" });
    expect(listener).toHaveBeenCalledTimes(4);
    expect(openDmId(getChatWidgetState())).toBe("a");
  });
});
