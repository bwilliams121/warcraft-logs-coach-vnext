export const ENVIRONMENT_OPTIONS: readonly string[];
export function environmentOptionLinesOf(profileText: string): string[];
export function clientBuildOf(text: string): string;
export function profileStemOf(className: string, specName: string): string;
export interface EngineSemantic {
  readonly semanticId: string;
  readonly sourcePath: string;
  readonly anchor: string;
  readonly before: number;
  readonly through: number;
}
export const ENGINE_SEMANTICS: readonly EngineSemantic[];
export function citeSemantic(
  semantic: EngineSemantic,
  text: string,
): {
  readonly semanticId: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly excerptSha256: string;
};
