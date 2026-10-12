import { beforeEach, describe, expect, it, vi } from "vitest";
import { changedFields, useStore } from "../state/store";
import { debounce, LatestOnly, isAbort } from "../lib/debounce";

const D = { age: 57, sex: "Male", dm: 0, ldl: 110 };

describe("store reducers", () => {
  beforeEach(() => {
    useStore.setState({ patient: {}, defaults: {}, hasPatient: false, caseId: undefined, selection: {}, explainTarget: "cad" });
    useStore.getState().setDefaults(D);
  });
  it("seeds the patient from schema defaults", () => {
    expect(useStore.getState().patient).toEqual(D);
    expect(useStore.getState().hasPatient).toBe(false);
  });
  it("setField marks the patient as edited and clears the case id", () => {
    useStore.getState().loadCase("lad", { age: 63 });
    expect(useStore.getState().caseId).toBe("lad");
    useStore.getState().setField("ldl", 160);
    const s = useStore.getState();
    expect(s.patient.ldl).toBe(160);
    expect(s.patient.age).toBe(63);
    expect(s.hasPatient).toBe(true);
    expect(s.caseId).toBeUndefined();
    expect(changedFields(s.patient, s.defaults).sort()).toEqual(["age", "ldl"]);
  });
  it("resetField restores one default; resetPatient returns the previous state for undo", () => {
    useStore.getState().setField("ldl", 160);
    useStore.getState().resetField("ldl");
    expect(useStore.getState().patient.ldl).toBe(110);
    useStore.getState().setField("dm", 1);
    const prev = useStore.getState().resetPatient();
    expect(useStore.getState().patient).toEqual(D);
    useStore.getState().restorePatient(prev, true);
    expect(useStore.getState().patient.dm).toBe(1);
  });
  it("selection and explain target stay in sync both ways", () => {
    useStore.getState().select("rca");
    expect(useStore.getState().explainTarget).toBe("rca");
    useStore.getState().setExplainTarget("cad");
    expect(useStore.getState().selection.target).toBeUndefined();
    useStore.getState().setExplainTarget("lcx");
    expect(useStore.getState().selection.target).toBe("lcx");
  });
  it("what-if changes add, remove and apply (with derived updates)", () => {
    const s = useStore.getState();
    s.setChange("ldl", 90);
    s.setChange("bp", 120);
    s.setChange("bp", undefined);
    expect(useStore.getState().whatIf.changes).toEqual({ ldl: 90 });
    useStore.getState().setWhatIf({ result: { derived_updates_applied: { bmi: 24.2 } } as never });
    useStore.getState().applyWhatIf();
    expect(useStore.getState().patient.ldl).toBe(90);
    expect(useStore.getState().patient.bmi).toBe(24.2);
    expect(useStore.getState().whatIf.changes).toEqual({});
  });
});

describe("debounce / cancellation", () => {
  it("debounce runs only the last call after the delay", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 250);
    d(1);
    d(2);
    vi.advanceTimersByTime(200);
    d(3);
    vi.advanceTimersByTime(249);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });
  it("LatestOnly aborts the previous request when a new one starts", () => {
    const l = new LatestOnly();
    const a = l.next();
    const b = l.next();
    expect(a.aborted).toBe(true);
    expect(b.aborted).toBe(false);
    l.abort();
    expect(b.aborted).toBe(true);
    expect(isAbort(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbort(new Error("x"))).toBe(false);
  });
});
