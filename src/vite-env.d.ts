interface Window {
  posAPI: {
    [key: string]: (...args: any[]) => Promise<any>
    getProducts: () => Promise<any[]>
  }
}
