import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "ts-api";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

function* walk(dir) {
   for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
         yield* walk(full);
      } else if (name.endsWith(".ts")) {
         yield full;
      }
   }
}

function rulesFor(file) {
   const rel = relative(SRC, file).split(sep).join("/");
   if (rel === "option.ts") {
      return { null: false, strict: false };
   }
   const strict = rel.startsWith("features/") || rel.startsWith("services/");
   return {
      null: !rel.startsWith("parsers/"),
      strict,
      optionalParams: strict && !rel.endsWith("/index.ts"),
   };
}

const findings = [];

function report(source, node, message) {
   const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
   findings.push(`${relative(ROOT, source.fileName)}:${line + 1}:${character + 1}  ${message}`);
}

function check(source, rules) {
   const visit = (node) => {
      if (rules.null && node.kind === ts.SyntaxKind.NullKeyword) {
         report(source, node, "null: wrap with option() at the boundary");
      }
      if (rules.strict) {
         if (node.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(node) && node.text === "undefined")) {
            report(source, node, "undefined: use Option<T> (some / none / option())");
         }
         if (node.kind === ts.SyntaxKind.QuestionDotToken) {
            report(source, node, "?.: check .some first");
         }
         if (node.kind === ts.SyntaxKind.QuestionQuestionToken) {
            report(source, node, "??: use orElse()");
         }
         if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && node.questionToken) {
            report(source, node.questionToken, "optional property: make it Option<T> or a discriminated union");
         }
         if (rules.optionalParams && ts.isParameter(node) && node.questionToken) {
            report(source, node.questionToken, "optional parameter: take Option<T>");
         }
      }
      ts.forEachChild(node, visit);
   };
   visit(source);
}

for (const file of walk(SRC)) {
   const rules = rulesFor(file);
   if (!rules.null && !rules.strict) {
      continue;
   }
   const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
   check(source, rules);
}

if (findings.length) {
   console.error(findings.join("\n"));
   console.error(`\n${findings.length} absence rule violation${findings.length === 1 ? "" : "s"}. See src/option.ts.`);
   process.exit(1);
}
console.log("absence rules: ok");
