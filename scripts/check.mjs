import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
for (const dir of ["src", "scripts", "tests"])
  for (const name of readdirSync(dir))
    if (/\.(js|mjs)$/.test(name))
      execFileSync(process.execPath, ["--check", `${dir}/${name}`], {
        stdio: "inherit",
      });
execFileSync(process.execPath, ["--check", "sw.js"], { stdio: "inherit" });
console.log("All JavaScript syntax checks passed.");
