declare module "pdf-parse/lib/pdf-parse.js" {
  const parse: (b: Buffer, o?: unknown) => Promise<{ numpages: number; text: string }>;
  export default parse;
}
