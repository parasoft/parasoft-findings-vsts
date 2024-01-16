declare module 'saxon-js' {
    interface options {
        stylesheetText: string;
        sourceText: string;
        destination: string;
    }

    interface transformResult {
        principalResult: string;
        resultDocuments: object;
        stylesheetInternal: object;
        masterDocument: unknown
    }

    function transform(options: options): transformResult;
}