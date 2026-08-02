import { parse, classifyComments } from "../pict";
import { PictModel } from "../pict";

describe("PICT comment classification", () => {
  it("attaches a single comment directly above a parameter", () => {
    const { comments } = parse(`# RAID level
Type: Single, Span, Stripe`);
    expect(comments).toHaveLength(1);
    expect(comments[0].attachedTo).toBe("Type");
    expect(comments[0].text).toBe("RAID level");
  });

  it("joins a contiguous multi-line block and attaches it to the next parameter", () => {
    const { comments } = parse(`# RAID level
# Single=standalone, RAID-5=parity-striped
Type: Single, Span, RAID-5`);
    expect(comments).toHaveLength(1);
    expect(comments[0].attachedTo).toBe("Type");
    expect(comments[0].text).toBe(
      "RAID level\nSingle=standalone, RAID-5=parity-striped",
    );
    expect(comments[0].lines).toHaveLength(2);
  });

  it("treats a comment separated by a blank line as freestanding", () => {
    const { comments } = parse(`# just documentation

Type: Single, Span`);
    expect(comments).toHaveLength(1);
    expect(comments[0].attachedTo).toBeNull();
    expect(comments[0].text).toBe("just documentation");
  });

  it("a blank line splits one block into freestanding + attached", () => {
    const { comments } = parse(`# header note

# total size in GB
Size: 10, 100, 1000`);
    expect(comments).toHaveLength(2);
    expect(comments[0].attachedTo).toBeNull();
    expect(comments[0].text).toBe("header note");
    expect(comments[1].attachedTo).toBe("Size");
    expect(comments[1].text).toBe("total size in GB");
  });

  it("attaches the comment above an =ai output line to that output field", () => {
    const { comments } = parse(`Type: Single, Span

# Decide whether each configuration is valid. Answer valid or invalid.
expected: =ai.choice`);
    const attached = comments.filter((c) => c.attachedTo === "expected");
    expect(attached).toHaveLength(1);
    expect(attached[0].text).toMatch(/Decide whether each configuration is valid/);
  });

  it("strips '# ' and a single following space only", () => {
    const { comments } = parse(`#no space
Type: A, B`);
    expect(comments[0].text).toBe("no space");
  });

  it("treats a comment above a non-parameter (constraint) line as freestanding", () => {
    const { comments } = parse(`A: 1, 2
B: 3, 4

# this explains the constraint
IF [A] = 1 THEN [B] = 3;`);
    const constraintComment = comments.find((c) =>
      c.text.includes("explains the constraint"),
    );
    expect(constraintComment).toBeDefined();
    expect(constraintComment!.attachedTo).toBeNull();
  });

  it("records 1-based line numbers for each comment line", () => {
    const { comments } = parse(`
# line two
Type: A`);
    expect(comments[0].lines[0].line).toBe(2);
  });

  it("is exposed on PictModel and standalone classifyComments identically", () => {
    const input = `# RAID level
Type: Single, Span`;
    const model = new PictModel(input);
    expect(model.comments).toEqual(classifyComments(input));
    expect(model.comments[0].attachedTo).toBe("Type");
  });
});
