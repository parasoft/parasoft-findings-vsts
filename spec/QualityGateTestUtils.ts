import * as fs from "fs";

export class QualityGateTestUtils {
    static compareMarkDown(markdownPath: string, expectedMarkdownPath:string) {
        let markDown = fs.readFileSync(markdownPath, {encoding: 'utf-8'});
        let expectedMarkDown = fs.readFileSync(expectedMarkdownPath, {encoding: 'utf-8'});

        expect(markDown).toEqual(expectedMarkDown);
        fs.rmSync(markdownPath, {recursive: true});
    }
}