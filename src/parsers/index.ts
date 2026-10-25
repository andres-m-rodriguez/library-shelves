import { ColorParser } from "./colorParser";
import { DayParser } from "./dayParser";
import { DragRefParser } from "./dragRefParser";
import { FileNameParser } from "./fileNameParser";
import { FilterQueryParser } from "./filterQueryParser";
import { IconSpecParser } from "./iconSpecParser";
import { IconThemeParser } from "./iconThemeParser";
import { LibraryFileParser } from "./libraryFileParser";
import { LibraryOutlineParser } from "./libraryOutlineParser";
import { OrderParser } from "./orderParser";
import { TagListParser } from "./tagListParser";
import { UriListParser } from "./uriListParser";

export {
   ColorParser,
   DayParser,
   DragRefParser,
   FileNameParser,
   FilterQueryParser,
   IconSpecParser,
   IconThemeParser,
   LibraryFileParser,
   LibraryOutlineParser,
   OrderParser,
   TagListParser,
   UriListParser,
};

export const parsers = {
   libraryFile: new LibraryFileParser(),
   outline: new LibraryOutlineParser(),
   iconTheme: new IconThemeParser(),
   iconSpec: new IconSpecParser(),
   color: new ColorParser(),
   day: new DayParser(),
   tags: new TagListParser(),
   order: new OrderParser(),
   filterQuery: new FilterQueryParser(),
   dragRef: new DragRefParser(),
   uriList: new UriListParser(),
   fileName: new FileNameParser(),
};
