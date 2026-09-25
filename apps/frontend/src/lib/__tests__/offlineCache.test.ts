import { describe, it, expect, beforeEach, vi } from "vitest";
import { cachedRequest, clearOfflineCache, readCache, writeCache } from "../offlineCache";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

const networkError = { code: "ERR_NETWORK", message: "Network Error" };

beforeEach(() => {
  localStorage.clear();
  setOnline(true);
  localStorage.setItem("logbook-email", "me@example.com");
});

describe("cachedRequest", () => {
  it("saves what it loads", async () => {
    const data = await cachedRequest("projects", async () => [{ id: "p1" }]);
    expect(data).toEqual([{ id: "p1" }]);
    expect(readCache("projects")).toEqual([{ id: "p1" }]);
  });

  it("answers from the cache when the network is unreachable", async () => {
    writeCache("projects", [{ id: "cached" }]);
    const data = await cachedRequest("projects", () => Promise.reject(networkError));
    expect(data).toEqual([{ id: "cached" }]);
  });

  it("still fails offline when nothing was cached", async () => {
    await expect(cachedRequest("nothing", () => Promise.reject(networkError))).rejects.toBe(networkError);
  });

  it("does not hide a real server error behind the cache", async () => {
    writeCache("projects", [{ id: "cached" }]);
    const serverError = { response: { status: 404 }, code: "ERR_BAD_REQUEST" };
    await expect(cachedRequest("projects", () => Promise.reject(serverError))).rejects.toBe(serverError);
  });

  it("never serves one account's data to another", () => {
    writeCache("projects", [{ id: "mine" }]);
    localStorage.setItem("logbook-email", "someone-else@example.com");
    expect(readCache("projects")).toBeUndefined();
  });

  it("is emptied on sign-out", () => {
    writeCache("projects", [{ id: "p1" }]);
    localStorage.setItem("unrelated", "kept");
    clearOfflineCache();
    expect(readCache("projects")).toBeUndefined();
    expect(localStorage.getItem("unrelated")).toBe("kept");
  });

  it("keeps working when storage is full", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await expect(cachedRequest("big", async () => "data")).resolves.toBe("data");
    spy.mockRestore();
  });
});
