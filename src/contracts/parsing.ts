export interface ParseIssue {
   message: string;
   line?: number;
}

export interface ParseResult<T> {
   value: T;
   issues: ParseIssue[];
}
