/* eslint-disable */
/* eslint-enable semi, eol-last, switch-colon-spacing, no-dupe-keys, indent, comma-dangle */

const path = require('node:path');
const { existsSync } = require('node:fs');
const { rmdir, stat, unlink, readdir, copyFile } = require('node:fs/promises');


const SRC_PATH = path.join(process.cwd(), process.env.SOURCE_PATH || "src");
const DEST_PATH = path.join(process.cwd(), process.env.OUTPUT_PATH || "dist");
const MD_PATH = path.join(process.cwd(), '..', 'README.md');


(async function() {
  if(!existsSync(DEST_PATH)) {
    throw new Error("Missing output directory for node.js' files");
  }

  if(!existsSync(SRC_PATH)) {
    throw new Error("Missing source directory for node.js' files");
  }

  if(process.env.NODE_ENV === 'production') {
    try {
      await rimraf(path.join(DEST_PATH, 'test'));

      await rmfl(DEST_PATH, [
        {
          rule: 'pattern',
          value: /(.*).spec(\.d)?.(ts|js)$/,
        },
        {
          rule: 'equals',
          value: 'test.ts',
        },
        {
          rule: 'equals',
          value: 'test.js',
        },
        {
          rule: 'equals',
          value: 'test.d.ts',
        },
      ]);
    } catch (err) {
      if(err?.code !== 'ENOENT') {
        throw err;
      }
    }

    if(existsSync(MD_PATH)) {
      await copyFile(MD_PATH, path.join(DEST_PATH, 'README.md'));
    }
  }
})();



async function rimraf(p) {
  if(!existsSync(p)) return;
  const s = await stat(p);

  if(s.isDirectory()) {
    const bc = await readdir(p);

    for(const fbase of bc) {
      const curr = path.join(p, fbase);
      await rimraf(curr);
    }

    await rmdir(p);
  } else {
    await unlink(p);
  }
}

/**
 * 
 * @param {string} p 
 * @param {Array<{ rule: 'startsWith' | 'endsWith' | 'equals'; value: string } | { rule: 'pattern'; value: RegExp }> | null} dif 
 */
async function rmfl(p, dif = null) {
  if(!existsSync(p) || dif == null || !Array.isArray(dif)) return;
  const s = await stat(p);

  if(s.isDirectory()) {
    const bc = await readdir(p);

    for(const fbase of bc) {
      const curr = path.join(p, fbase);
      await rmfl(curr, dif);
    }
  } else {
    const base = path.basename(p);

    for(const { rule, value } of dif) {
      if(rule === 'pattern') {
        if(value.test(base)) {
          await unlink(p);
        }

        continue;
      }

      if(rule === 'equals') {
        if(value === base) {
          await unlink(p);
        }

        continue;
      }

      if(value[rule](value)) {
        await unlink(p);
      }
    }
  }
}
