import { CHAR_METADATA, type CharSpec } from "../generated/charMetadata.js";
import type { HC } from "../generated/HC.js";

export class CharMetadataRegistry {
  static instance: CharMetadataRegistry | null = null;

  static get(): CharMetadataRegistry {
    if (!this.instance) this.instance = new CharMetadataRegistry();
    return this.instance;
  }

  private constructor(private readonly data: Record<string, CharSpec> = CHAR_METADATA) {}

  has(hc: HC | string): boolean {
    return hc in this.data;
  }

  spec(hc: HC | string): CharSpec {
    const s = this.data[hc as string];
    if (!s) {
      return {
        hc: hc as string,
        format: "String",
        readable: true,
        writable: true,
        events: true,
        eventLike: false,
        defaultValue: null,
      };
    }
    return s;
  }

  defaultValue(hc: HC | string): unknown {
    return this.spec(hc).defaultValue;
  }
}
