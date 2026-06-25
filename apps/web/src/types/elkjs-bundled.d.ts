declare module 'elkjs/lib/elk.bundled.js' {
  export interface ElkLayoutOptions {
    [key: string]: string;
  }
  export interface ElkExtendedEdge {
    id: string;
    sources: string[];
    targets: string[];
  }
  export interface ElkNode {
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    children?: ElkNode[];
    edges?: ElkExtendedEdge[];
    layoutOptions?: ElkLayoutOptions;
    labels?: { text?: string }[];
  }
  export default class ELK {
    constructor(options?: unknown);
    layout(graph: ElkNode, options?: unknown): Promise<ElkNode>;
  }
}
