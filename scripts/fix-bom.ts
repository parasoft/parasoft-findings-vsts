import * as fs from 'fs';
import * as process from 'process';

interface License {
    license: { 
        id?: string;
        url?: string
    }
}

interface ExternalReference {
    type: string;
    url: string;
}

interface Component {
    purl: string;
    licenses: License[];
    externalReferences: ExternalReference[];
}

interface SBOM {
    components: Component[];
}

// Read JSON file
function readJSONFile<T>(filePath: string): T {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent) as T;
}

// Get file paths from command-line arguments
const sbomFilePath = process.argv[2];
const licenseMappingFilePath = process.argv[3];
const injectionMappingFilePath = process.argv[4];

// Load the SBOM and license mapping JSON files
const sbom: SBOM = readJSONFile<SBOM>(sbomFilePath);
const licenseMapping: Component[] = readJSONFile<Component[]>(licenseMappingFilePath);
const injectionMapping: { purl: string; externalReferences: { type: string; url: string }[] }[] = readJSONFile<typeof injectionMapping>(injectionMappingFilePath);

// Function to update licenses in SBOM based on the license mapping
function update(sbom: SBOM, licenseMap: Component[], injectionMap: typeof injectionMapping): SBOM {
    sbom.components.forEach(component => {
        if (!component.licenses || !component.licenses[0]?.license?.id || !component.licenses[0]?.license?.url) {
            // console.debug("\"Licenses\" for component " + component.purl + " is incomplete. Trying to update it based on: " + licenseMappingFilePath);
            const mapping = licenseMap.find(m => m.purl === component.purl);
            if (mapping) {
                component.licenses = mapping.licenses;
                // TODO: make sure both 'id' and 'url' are present in the license object
                // console.debug("\"Licenses\" for component " + component.purl + " is updated.");
            } else {
                console.log(`Missing "Licenses" information for component ${component.purl}`);
            }
        }
        if (!component.externalReferences) {
            console.log(`"externalReferences" for component ${component.purl} is missing.`);
            component.externalReferences = [];
        }
        const licenseRef = component.externalReferences.find(ref => ref.type === 'license');
        if (!licenseRef && component.licenses[0]?.license?.url) {
            component.externalReferences.push({ type: 'license', url: component.licenses[0].license.url });
            // console.debug("\"license\" in \"externalReferences\" for component " + component.purl + " is updated.");
        }
        const otherRef = component.externalReferences.find(ref => ref.type === 'other');
        if (!otherRef) {
            const mapping = injectionMap.find(m => m.purl === component.purl);
            if (mapping) {
                const other = mapping.externalReferences.find(ref => ref.type === 'other');
                if (other) {
                    component.externalReferences.push({ type: 'other', url: other.url });
                    // console.debug("\"other\" in \"externalReferences\" for component " + component.purl + " is updated.");
                    return;
                }
            }
            console.log(`Missing "other" information in "externalReferences" for component ${component.purl}`);
        }
    });
    return sbom;
}

// Update the SBOM licenses
const updatedSbom = update(sbom, licenseMapping, injectionMapping);

// Save the updated SBOM back to the original file
fs.writeFileSync(sbomFilePath, JSON.stringify(updatedSbom, null, 2), 'utf8');

console.log('SBOM licenses updated based on license-mapping.json and injection-mapping.json.');
