import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

describe("Durable Object migration bundle",()=>{
  it("imports and exports every journal entry exactly once",()=>{
    const manifest=readFileSync(new URL("../migrations/migrations.js",import.meta.url),"utf8");
    const journal=JSON.parse(readFileSync(new URL("../migrations/meta/_journal.json",import.meta.url),"utf8")) as {entries:{idx:number;tag:string}[]};
    const imports=[...manifest.matchAll(/import (m\d+) from ['"]\.\/(.+?)\.sql['"]/g)];
    const names=imports.map(match=>match[1]);
    expect(new Set(names).size).toBe(names.length);
    expect(imports.map(match=>match[2])).toEqual(journal.entries.map(entry=>entry.tag));
    const exports=manifest.match(/migrations:\s*\{([^}]+)\}/)![1]!.split(",").map(name=>name.trim()).filter(Boolean);
    expect(exports).toEqual(journal.entries.map(entry=>`m${String(entry.idx).padStart(4,"0")}`));
  });
});
