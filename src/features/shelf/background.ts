import * as path from "path";
import * as vscode from "vscode";
import { BACKGROUND_KEY, DEFAULT_BACKGROUND_DIM, DEFAULT_BACKGROUND_FIT, type BackgroundFit } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { exists, toRelative } from "../../library/files";
import { none, option, orElse, some, type Option } from "../../option";
import { parsers } from "../../parsers";

const IMAGE_EXTENSIONS = ["gif", "png", "jpg", "jpeg", "webp", "avif", "bmp", "svg"];

type Step = "image" | "dim" | "fit" | "remove";
type StepItem = vscode.QuickPickItem & { step: Step };
type DimItem = vscode.QuickPickItem & { dim: number };
type FitItem = vscode.QuickPickItem & { fit: BackgroundFit };

const DIMS: DimItem[] = [
   { label: "None", description: "the image as it is", dim: 0 },
   { label: "Light", description: "25%", dim: 0.25 },
   { label: "Medium", description: "50%", dim: 0.5 },
   { label: "Strong", description: "70%, the default", dim: 0.7 },
   { label: "Very strong", description: "85%", dim: 0.85 },
];

const FITS: FitItem[] = [
   { label: "Fill the window", description: "crops the edges if the shape differs", fit: "cover" },
   { label: "Show the whole image", description: "leaves empty space if the shape differs", fit: "contain" },
   { label: "Repeat as tiles", description: "for small patterns", fit: "tile" },
];

export async function setBackground(ctx: FeatureContext): Promise<void> {
   const jsonUri = await ctx.library.find();
   if (!jsonUri.some) {
      return;
   }
   const opened = await ctx.library.open(jsonUri.value);
   if (!opened.some) {
      return;
   }
   const current = parsers.libraryFile.backgroundOf(opened.value.data);
   const image = option(current.image);
   const dim = orElse(option(current.dim), DEFAULT_BACKGROUND_DIM);
   const fit = orElse(option(current.fit), DEFAULT_BACKGROUND_FIT);

   const steps: StepItem[] = [
      { step: "image", label: "$(file-media) Choose Image...", description: image.some ? image.value : "a picture or an animated GIF" },
   ];
   if (image.some) {
      steps.push(
         { step: "dim", label: "$(color-mode) Dimming...", description: `${Math.round(dim * 100)}%` },
         { step: "fit", label: "$(screen-full) Fit...", description: orElse(option(FITS.find((item) => item.fit === fit)), FITS[0]).label },
         { step: "remove", label: "$(trash) Remove Background" },
      );
   }
   const step = await ctx.dialogs.pick(steps, { placeHolder: "Background of the shelves" });
   if (!step.some) {
      return;
   }

   switch (step.value.step) {
      case "image": {
         const picked = await pickImage(ctx, jsonUri.value);
         if (picked.some) {
            await ctx.library.edit(jsonUri.value, (doc) => doc.set([BACKGROUND_KEY, "image"], picked.value));
         }
         return;
      }
      case "dim": {
         const choice = await ctx.dialogs.pick(DIMS, { placeHolder: "How strongly the editor color covers the image" });
         if (choice.some) {
            await ctx.library.edit(jsonUri.value, (doc) => doc.set([BACKGROUND_KEY, "dim"], choice.value.dim));
         }
         return;
      }
      case "fit": {
         const choice = await ctx.dialogs.pick(FITS, { placeHolder: "How the image fills the window" });
         if (choice.some) {
            await ctx.library.edit(jsonUri.value, (doc) => doc.set([BACKGROUND_KEY, "fit"], choice.value.fit));
         }
         return;
      }
      case "remove":
         await ctx.library.edit(jsonUri.value, (doc) => doc.remove([BACKGROUND_KEY]));
   }
}

// The page can only load files from the library's own folder, so an image from
// elsewhere is copied in after asking. Resolves to the path stored in the library.
async function pickImage(ctx: FeatureContext, jsonUri: vscode.Uri): Promise<Option<string>> {
   const folder = path.dirname(jsonUri.fsPath);
   const chosen = option(
      await vscode.window.showOpenDialog({
         canSelectMany: false,
         defaultUri: vscode.Uri.file(folder),
         filters: { Images: IMAGE_EXTENSIONS },
         openLabel: "Use as Background",
      }),
   );
   if (!chosen.some || !chosen.value.length) {
      return none;
   }
   const source = chosen.value[0];
   const relative = toRelative(folder, source.fsPath);
   if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return some(relative);
   }

   const fileName = path.basename(source.fsPath);
   const target = vscode.Uri.file(path.join(folder, fileName));
   const alreadyThere = await exists(target);
   if (alreadyThere) {
      ctx.dialogs.info(`${fileName} already exists next to the library, so that file is used.`);
      return some(fileName);
   }
   const copy = "Copy Here";
   const answer = await ctx.dialogs.ask(`${fileName} is outside the library's folder. Copy it next to the library so the shelves can show it?`, copy);
   if (!answer.some) {
      return none;
   }
   await vscode.workspace.fs.copy(source, target, { overwrite: false });
   return some(fileName);
}
