import {
  lstat,
  link,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { writeUtf8 } from "../../src/shared/fs.js";

describe("writeUtf8", () => {
  it("atomically replaces file content and preserves mode", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-write-"));
    const filePath = join(cwd, "README.md");

    await writeFile(filePath, "old", { mode: 0o640 });
    await writeUtf8(filePath, "new");

    expect(await readFile(filePath, "utf8")).toBe("new");
    expect((await stat(filePath)).mode & 0o777).toBe(0o640);
  });

  it("writes through a symlink without replacing the link", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-write-link-"));
    const targetPath = join(cwd, "target.md");
    const linkPath = join(cwd, "link.md");

    await writeFile(targetPath, "old", { mode: 0o640 });
    await symlink(targetPath, linkPath);
    await writeUtf8(linkPath, "new");

    expect(await readFile(targetPath, "utf8")).toBe("new");
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await realpath(linkPath)).toBe(await realpath(targetPath));
  });

  it("updates all hard links without replacing the shared inode", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-write-hard-link-"));
    const filePath = join(cwd, "README.md");
    const aliasPath = join(cwd, "README-alias.md");

    await writeFile(filePath, "old");
    await link(filePath, aliasPath);

    await writeUtf8(filePath, "new");

    expect(await readFile(filePath, "utf8")).toBe("new");
    expect(await readFile(aliasPath, "utf8")).toBe("new");
    expect((await stat(filePath)).ino).toBe((await stat(aliasPath)).ino);
  });

  it("rejects a missing target without creating a replacement", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-write-failure-"));
    const filePath = join(cwd, "README.md");

    await writeFile(filePath, "old");
    await unlink(filePath);

    await expect(writeUtf8(filePath, "new")).rejects.toBeInstanceOf(Error);
  });

  it("cleans up after a successful replacement", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-write-failure-"));
    const filePath = join(cwd, "README.md");

    await writeFile(filePath, "old");

    await expect(writeUtf8(filePath, "new")).resolves.toBeUndefined();
    expect((await readdir(cwd)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
