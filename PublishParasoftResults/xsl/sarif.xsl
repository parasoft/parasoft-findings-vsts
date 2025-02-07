<?xml version="1.0"?>
    
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:xs="http://www.w3.org/2001/XMLSchema">
    
    <xsl:output method="text" encoding="UTF-8" omit-xml-declaration="yes" indent="no" media-type="application/json" />
    
    <xsl:param name="skip_not_violated_rules">true</xsl:param>
    <xsl:param name="skip_suppressed">false</xsl:param>
    <xsl:param name="duplicates_as_code_flow">true</xsl:param>
    <xsl:param name="projectRootPaths"><xsl:value-of select="/ResultsSession/@projectRootPaths"/></xsl:param>

    <!-- Used to store the URI prefix adapted to the current report for later calculation of the relative path -->
    <xsl:variable name="uriPrefix">
        <xsl:variable name="firstLocUri" select="/ResultsSession/Scope/Locations/Loc[1]/@uri"/>
        <xsl:choose>
            <!-- Try to take the first <Loc> as an example to get prefix -->
            <xsl:when test="$firstLocUri">
                <xsl:choose>
                    <!-- for file:/xxx uri pattern -->
                    <xsl:when test="matches($firstLocUri, '^file:/[^/]')">file:/</xsl:when>
                    <!-- for file://hostname/xxx uri pattern -->
                    <xsl:when test="matches($firstLocUri, '^file://[^/]+/')">
                        <!-- Extract the hostname from an uri, like: the result is 'hostname' for uri 'file://hostname/folder/xxx' -->
                        <xsl:variable name="hostname" select="replace($firstLocUri, '^file://([^/]+)(/.*)$', '$1')" />
                        <xsl:value-of select="concat('file://', $hostname, '/')" />
                    </xsl:when>
                    <!-- for file:///xxx uri pattern -->
                    <xsl:otherwise>file:///</xsl:otherwise>
                </xsl:choose>
            </xsl:when>
            <xsl:otherwise>
                <!-- For cppTest professional report (not for additional reports generated since version 2024.1), there is no prefix in URI. And the structure is: /ResultsSession/Locations/Loc -->
            </xsl:otherwise>
        </xsl:choose>
    </xsl:variable>

    <xsl:variable name="tempProjectRootPathElements">
        <xsl:variable name="projectRootPathArray" select="tokenize($projectRootPaths, ';')"/>
        <xsl:for-each select="$projectRootPathArray">
            <xsl:variable name="contactedUri">
                <xsl:value-of select="$uriPrefix"/>
                <xsl:choose>
                    <xsl:when test="$uriPrefix != '' and starts-with(., '/')">
                    <!-- Trim the spaces at the front and back ends, and trim the / at the beginning of the path -->
                        <xsl:value-of select="replace(replace(replace(., '^/', ''), '^\s+', ''), '\s+$', '')"/>
                    </xsl:when>
                    <xsl:otherwise>
                        <xsl:value-of select="replace(replace(., '^\s+', ''), '\s+$', '')"/>
                    </xsl:otherwise>
                </xsl:choose>
            </xsl:variable>
            <xsl:variable name="translatedUri" select="translate($contactedUri, '\', '/')"/>
            <xsl:variable name="processedUri">
                <xsl:choose>
                    <xsl:when test="ends-with($translatedUri, '/')">
                        <xsl:value-of select="$translatedUri"/>
                    </xsl:when>
                    <xsl:otherwise>
                        <xsl:value-of select="concat($translatedUri, '/')"/>
                    </xsl:otherwise>
                </xsl:choose>
            </xsl:variable>
            <xsl:element name="PROJECTROOT">
                <xsl:attribute name="name">PROJECTROOT-<xsl:value-of select="position()"/></xsl:attribute>
                <xsl:attribute name="uri">
                    <xsl:value-of select="$processedUri"/>
                </xsl:attribute>
                <xsl:attribute name="encodedUri">
                    <xsl:call-template name="getEncodedPath">
                        <xsl:with-param name="path" select="$processedUri"/>
                    </xsl:call-template>
                </xsl:attribute>
            </xsl:element>
        </xsl:for-each>
    </xsl:variable>

    <xsl:variable name="qt">"</xsl:variable>
    <xsl:variable name="illegalChars" select="'\/&quot;&#xD;&#xA;&#x9;'"/>
    <xsl:variable name="illegalCharReplacements" select="'\/&quot;rnt'"/>
    <xsl:variable name="markdownChars" select="'*_{}[]()#+-.!'"/>
    <xsl:variable name="markdownNewLine">  \n</xsl:variable>
    <xsl:variable name="nbsp" select="concat('&amp;','nbsp;')"/>
    <!-- Retrieve the ID of the first rule within the first category based on the value of the "skip_not_violated_rules" variable.
         This variable determines whether any rules that have not been violated should be skipped. -->
    <xsl:variable name="categories" select="/ResultsSession/CodingStandards/Rules/CategoriesList//Category"/>
    <xsl:variable name="rules" select="/ResultsSession/CodingStandards/Rules/RulesList/Rule"/>
    <xsl:variable name="firstCategoryHasRules" select="($categories[@name = $rules/@cat])[1]" />
    <xsl:variable name="firstRuleInCategoryId" select="($rules[@cat=$firstCategoryHasRules/@name])[1]/@id"/>
    <xsl:variable name="firstCategoryHasViolations" select="($categories[@name = $rules[string-length(@total) = 0 or @total &gt; 0]/@cat])[1]" />
    <xsl:variable name="firstRuleWithViolationId" select="($rules[@cat=$firstCategoryHasViolations/@name and (string-length(@total) = 0 or @total &gt; 0)])[1]/@id" />
    <xsl:variable name="firstRuleId">
        <xsl:choose>
            <xsl:when test="$skip_not_violated_rules = 'true'">
                <xsl:value-of select="$firstRuleWithViolationId"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$firstRuleInCategoryId"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:variable>
    <!-- Help to find the first location that satisfy specific conditions -->
    <xsl:variable name="reps" select="/ResultsSession/Scope/Repositories/*[@repRef = /ResultsSession/Scope/Locations/Loc/@repRef]"/>
    <xsl:variable name="repoCount" select="count($reps)"/>
    <xsl:variable name="firstLocHash">
        <xsl:call-template name="getFirstLocHash">
            <xsl:with-param name="repoIndex" select="1"/>
        </xsl:call-template>
    </xsl:variable>
    <xsl:template name="getFirstLocHash">
        <xsl:param name="repoIndex"/>
        <xsl:variable name="repoIdx1" select="/ResultsSession/Scope/Locations/Loc[generate-id()=generate-id(key('distinctRepositoryIdx1',$reps[$repoIndex]/@repRef)[1])][1]"/>
        <xsl:choose>
            <xsl:when test="$repoIdx1">
                <xsl:value-of select="$repoIdx1/@hash"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:variable name="repoIdx2" select="/ResultsSession/Scope/Locations/Loc[generate-id()=generate-id(key('distinctRepositoryIdx2',concat($reps[$repoIndex]/@repRef,'_',@branch))[1])][1]"/>
                <xsl:choose>
                    <xsl:when test="$repoIdx2">
                        <xsl:value-of select="$repoIdx2/@hash"/>
                    </xsl:when>
                    <xsl:otherwise>
                        <xsl:if test="number($repoIndex) &lt; number($repoCount)">
                            <xsl:call-template name="getFirstLocHash">
                                <xsl:with-param name="repoIndex" select="$repoIndex + 1"/>
                            </xsl:call-template>
                        </xsl:if>
                    </xsl:otherwise>
                </xsl:choose>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    <!-- Help to find the first ElDesc element for each FlowViol or DupViol -->
    <xsl:accumulator name="thread_flow_counter" as="xs:integer" initial-value="0">
        <xsl:accumulator-rule match="ElDesc[@ln]" select="$value + 1"/>
        <xsl:accumulator-rule match="FlowViol/ElDescList | DupViol/ElDescList" phase="end" select="0"/>
    </xsl:accumulator>
    <xsl:mode use-accumulators="#all"/>
    
    <xsl:template match="/ResultsSession">
        <xsl:text>{ "$schema": "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json", "version": "2.1.0", "runs": [ {</xsl:text>
        <xsl:text>"tool": { "driver": {</xsl:text>
        <xsl:text>"name": "</xsl:text>
        <xsl:choose>
            <xsl:when test="@toolDispName">
                <xsl:value-of select="@toolDispName" />
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="@toolName" />
            </xsl:otherwise>
        </xsl:choose>
        <xsl:text>", </xsl:text>
        <xsl:text>"semanticVersion": "</xsl:text><xsl:value-of select="@toolVer" /><xsl:text>",</xsl:text>
        
        <xsl:text>"rules": [</xsl:text>
            <xsl:call-template name="rules_list"/>
        <xsl:text>] } }</xsl:text>
        <xsl:call-template name="version_control_provenance"/>

        <!-- $tempProjectRootPathElements/PROJECTROOT will be empty if no value pass to projectRootPaths -->
        <xsl:if test="$tempProjectRootPathElements/PROJECTROOT">
            <xsl:text>, "originalUriBaseIds": {</xsl:text>
                <xsl:call-template name="original_uri_base_ids"/>
            <xsl:text>}</xsl:text>
        </xsl:if>

        <xsl:text>, "results": [</xsl:text>
            <!-- static violations list -->
            <xsl:call-template name="results"/>
        <xsl:text>], "artifacts": [ </xsl:text>
            <!--   checked files list     -->
            <xsl:call-template name="get_artifacts"/>
        <xsl:text>] } ] }</xsl:text>
    </xsl:template>
    
    <xsl:template name="rules_list">
        <xsl:for-each select="/ResultsSession/CodingStandards/Rules/CategoriesList/Category">
            <xsl:call-template name="rules_category">
                <xsl:with-param name="parentTags" select="''"/>
            </xsl:call-template>
        </xsl:for-each>
    </xsl:template>
    
    <xsl:template name="rules_category">
        <xsl:param name="parentTags"/>
        <xsl:variable name="category_desc"><xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@desc" /></xsl:call-template></xsl:variable>
        <xsl:variable name="tags" select="concat($qt,$category_desc,$qt)"/>
        <xsl:variable name="appended_tags" select="if(string-length($parentTags) > 0) then concat($parentTags,', ',$tags) else $tags"/>
        <xsl:variable name="cat" select="@name"/>

        <xsl:for-each select="/ResultsSession/CodingStandards/Rules/RulesList/Rule[@cat=($cat)]">
            <xsl:if test="$skip_not_violated_rules!='true' or string-length(@total)=0 or @total>0">
                <xsl:call-template name="rule_descr">
                    <xsl:with-param name="tags" select="$appended_tags"/>
                </xsl:call-template>
            </xsl:if>
        </xsl:for-each>

        <xsl:for-each select="./Category">
            <xsl:call-template name="rules_category">
                <xsl:with-param name="parentTags" select="$appended_tags"/>
            </xsl:call-template>
        </xsl:for-each>
    </xsl:template>

    <xsl:template name="rule_descr">
        <xsl:param name="tags"/>
        <xsl:if test="$firstRuleId != @id">
            <xsl:text>, </xsl:text>
        </xsl:if>

        <xsl:text>{ </xsl:text>
        <xsl:text>"id": "</xsl:text><xsl:value-of select="@id" /><xsl:text>"</xsl:text>
        <xsl:text>, "name": "</xsl:text>
        <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@desc" /></xsl:call-template>
        <xsl:text>"</xsl:text>
        <xsl:text>, "shortDescription": { "text": "</xsl:text>
        <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@desc" /></xsl:call-template>
        <xsl:text>" }</xsl:text>
        <xsl:text>, "fullDescription": { "text": "</xsl:text>
        <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@desc" /></xsl:call-template>
        <xsl:text> [</xsl:text><xsl:value-of select="@id" /><xsl:text>]</xsl:text>
        <xsl:text>" }</xsl:text>
        <xsl:text>, "defaultConfiguration": { </xsl:text>
        <xsl:call-template name="severity_level">
            <xsl:with-param name="parsoft_severity" select="@sev"/>
        </xsl:call-template>
        <xsl:text> }</xsl:text>
        <xsl:text>, "help": { "text": "</xsl:text>
        
        <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@desc" /></xsl:call-template>
        <xsl:text> [</xsl:text><xsl:value-of select="@id" /><xsl:text>]</xsl:text>
        
        <xsl:text>" }</xsl:text>
        
        <xsl:text>, "properties": { "tags": [ </xsl:text><xsl:value-of select="$tags" /><xsl:text> ]</xsl:text>
            <xsl:variable name="category" select="lower-case(@cat)"/>
            <xsl:if test="contains($category, 'security')
                    or starts-with($category, 'owasp')
                    or starts-with($category, 'cwe')
                    or starts-with($category, 'pcidss')
                    or starts-with($category, 'apsc')">
                <xsl:call-template name="security_severity_level">
                    <xsl:with-param name="parasoft_severity" select="@sev"/>
                </xsl:call-template>
            </xsl:if>
            <xsl:text> }</xsl:text>
        <xsl:text> }</xsl:text>
    </xsl:template>

    <xsl:key name="distinctRepositoryIdx1" match="/ResultsSession/Scope/Locations/Loc[@repRef and not(@branch)]" use="@repRef" />
    <xsl:key name="distinctRepositoryIdx2" match="/ResultsSession/Scope/Locations/Loc[@repRef and @branch]" use="concat(@repRef,'_',@branch)" />

    <xsl:template name="version_control_provenance">
        <xsl:if test="count($reps) > 0">
            <xsl:text>, "versionControlProvenance": [</xsl:text>

            <xsl:for-each select="$reps">
                <xsl:variable name="url" select="@url"/>
                <xsl:variable name="repRef" select="@repRef"/>

                <xsl:for-each select="/ResultsSession/Scope/Locations/Loc[generate-id()=generate-id(key('distinctRepositoryIdx1',$repRef)[1])]">
                    <xsl:if test="$firstLocHash != @hash">
                        <xsl:text>, </xsl:text>
                    </xsl:if>
                    <xsl:text>{ "repositoryUri": "</xsl:text><xsl:value-of select="$url" /><xsl:text>"</xsl:text>
                    <xsl:text>, "mappedTo": { "uriBaseId": "ROOT_</xsl:text><xsl:value-of select="@repRef" /><xsl:text>" }</xsl:text>
                    <xsl:text> }</xsl:text>
                </xsl:for-each>

                <xsl:for-each select="/ResultsSession/Scope/Locations/Loc[generate-id()=generate-id(key('distinctRepositoryIdx2',concat($repRef,'_',@branch))[1])]">
                    <xsl:if test="$firstLocHash != @hash">
                        <xsl:text>, </xsl:text>
                    </xsl:if>
                    <xsl:text>{ "repositoryUri": "</xsl:text><xsl:value-of select="$url" /><xsl:text>"</xsl:text>
                    <xsl:text>, "branch": "</xsl:text><xsl:value-of select="@branch" /><xsl:text>"</xsl:text>
                    <xsl:text>, "mappedTo": { "uriBaseId": "ROOT_</xsl:text><xsl:value-of select="concat(@repRef,'_',@branch)" /><xsl:text>" }</xsl:text>
                    <xsl:text> }</xsl:text>
                </xsl:for-each>
            </xsl:for-each>
            <xsl:text>]</xsl:text>
        </xsl:if>
    </xsl:template>

    <xsl:template name="original_uri_base_ids">
        <xsl:for-each select="$tempProjectRootPathElements/PROJECTROOT">
            <xsl:if test="position() != 1">,</xsl:if>
            <xsl:text>"</xsl:text>
            <xsl:value-of select="@name"/>
            <xsl:text>": { "uri": "</xsl:text>
            <xsl:value-of select="@uri"/>
            <xsl:text>" }</xsl:text>
        </xsl:for-each>
    </xsl:template>

    <xsl:template name="results">
        <xsl:for-each select="/ResultsSession/CodingStandards/StdViols/*[string-length(@supp)=0 or @supp!='true' or $skip_suppressed!='true']">
            <xsl:if test="position() != 1">
                <xsl:text>, </xsl:text>
            </xsl:if>
            <xsl:call-template name="result"/>
        </xsl:for-each>
    </xsl:template>

    <xsl:template name="result">
        <xsl:text>{ </xsl:text>
        <xsl:text>"ruleId": "</xsl:text><xsl:value-of select="@rule" /><xsl:text>"</xsl:text>
        <xsl:text>, </xsl:text>
        <xsl:call-template name="severity_level">
            <xsl:with-param name="parsoft_severity" select="@sev"/>
        </xsl:call-template>
        <xsl:text>, "message": { "text": "</xsl:text>
        <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@msg" /></xsl:call-template>
        <xsl:variable name="locationUri">
            <xsl:call-template name="location_uri"><xsl:with-param name="isMainLocation">true</xsl:with-param></xsl:call-template>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="string-length($locationUri) > 0">
                <xsl:text>", "markdown": "**[\\[Line </xsl:text><xsl:value-of select="@locStartln" /><xsl:text>\\]](</xsl:text>
                <xsl:value-of select="$locationUri" />
                <xsl:text>) </xsl:text>
            </xsl:when>
            <xsl:otherwise>
                <xsl:text>", "markdown": "**\\[Line </xsl:text><xsl:value-of select="@locStartln" /><xsl:text>\\] </xsl:text>
            </xsl:otherwise>
        </xsl:choose>
        <xsl:call-template name="escape_markdown_chars"><xsl:with-param name="text" select="@msg" /></xsl:call-template>
        <xsl:text>**</xsl:text>

        <xsl:if test="local-name()='FlowViol'">
            <xsl:value-of select="$markdownNewLine" />
            <xsl:call-template name="flow_viol_markdown" />
        </xsl:if>
        <xsl:if test="local-name()='DupViol'">
            <xsl:value-of select="$markdownNewLine" />
            <xsl:call-template name="dup_viol_markdown"/>
        </xsl:if>

        <xsl:text>" }</xsl:text>
        <xsl:text>, "partialFingerprints": { </xsl:text>
            <xsl:text>"violType": "</xsl:text><xsl:value-of select="name()" /><xsl:text>"</xsl:text>
            <xsl:if test="string-length(@lineHash) > 0">
                <xsl:text>, "lineHash": "</xsl:text><xsl:value-of select="@lineHash" /><xsl:text>"</xsl:text>
            </xsl:if>
            <xsl:if test="string-length(@unbViolId) > 0">
                <xsl:text>, "unbViolId": "</xsl:text><xsl:value-of select="@unbViolId" /><xsl:text>"</xsl:text>
            </xsl:if>
        <xsl:text> }</xsl:text>
        <xsl:text>, "locations": [ </xsl:text>
        <xsl:choose>
            <xsl:when test="local-name()='DupViol' and $duplicates_as_code_flow!='true'">
                <xsl:call-template name="duplicated_code_locations">
                    <xsl:with-param name="descriptors" select="./ElDescList/ElDesc"/>
                </xsl:call-template>
            </xsl:when>
            <xsl:otherwise>
                <xsl:text>{ </xsl:text><xsl:call-template name="result_physical_location"/><xsl:text> }</xsl:text>
            </xsl:otherwise>
        </xsl:choose>
        <xsl:text> ]</xsl:text>

        <xsl:if test="local-name()='FlowViol' or (local-name()='DupViol' and $duplicates_as_code_flow='true')">
        <xsl:text>, "codeFlows": [ { </xsl:text>
        <xsl:text>"threadFlows": [ { "locations": [ </xsl:text>
        <xsl:call-template name="thread_flow_locations">
            <xsl:with-param name="descriptors" select="./ElDescList/ElDesc"/>
            <xsl:with-param name="type" select="local-name()"/>
            <xsl:with-param name="nestingLevel">0</xsl:with-param>
        </xsl:call-template>
        <xsl:text> ]</xsl:text>
        <xsl:text> } ] } ]</xsl:text>
        </xsl:if>

        <xsl:if test="@supp='true'">
            <xsl:text>, "suppressions": [ { "kind": "external"</xsl:text>
            <xsl:text>, "justification": "</xsl:text>
            <xsl:value-of select="/ResultsSession/CodingStandards/Supps/Supp[@refId=current()/@suppRef]/@suppRsn"/>
            <xsl:text>"} ]</xsl:text>
        </xsl:if>
        <xsl:text> }</xsl:text>
    </xsl:template>

    <xsl:template name="get_artifacts">
        <!-- Filter <Loc> nodes and only save checked files with <URI> in $checkedFiles -->
        <xsl:variable name="checkedFiles">
            <xsl:variable name="locs">
                <xsl:sequence select="/ResultsSession//Locations/Loc[not(@rejBy) and (not(@accLns) or @accLns > 0)]"/>
            </xsl:variable>
            <xsl:choose>
                <xsl:when test="$locs/Loc/@uri">
                    <xsl:for-each select="$locs/Loc/@uri">
                        <URI>
                            <xsl:attribute name="uri"><xsl:value-of select="."/></xsl:attribute>
                        </URI>
                    </xsl:for-each>
                </xsl:when>
                <xsl:otherwise>
                    <!-- For cppTest professional report (not for additional reports generated since version 2024.1), there is no @uri in <Loc> but only @fsPath -->
                    <xsl:for-each select="$locs/Loc/@fsPath">
                        <URI>
                            <xsl:attribute name="uri"><xsl:value-of select="translate(., '\', '/')"/></xsl:attribute>
                        </URI>
                    </xsl:for-each>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:variable>
        <!-- For each checked file, analyze URI to generate "location" object. -->
        <xsl:for-each select="$checkedFiles/URI">
            <xsl:variable name="matchedProjectPath">
                <xsl:call-template name="get_matching_project_path">
                    <xsl:with-param name="matchingURI" select="current()/@uri"/>
                </xsl:call-template>
            </xsl:variable>
            <xsl:if test="position() != 1">,</xsl:if>
            <xsl:choose>
                <xsl:when test="$matchedProjectPath/RESULT">
                    <xsl:call-template name="get_relative_artifact">
                        <xsl:with-param name="checkedFile" select="current()" />
                        <xsl:with-param name="uriBase" select="$matchedProjectPath/RESULT/@uri"/>
                        <xsl:with-param name="uriBaseId" select="$matchedProjectPath/RESULT/@name"/>
                    </xsl:call-template>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:call-template name="get_default_artifact">
                        <xsl:with-param name="checkedFile" select="current()" />
                    </xsl:call-template>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:for-each>
    </xsl:template>

    <xsl:template name="get_relative_artifact">
        <xsl:param name="checkedFile"/>
        <xsl:param name="uriBase"/>
        <xsl:param name="uriBaseId"/>
        <xsl:text>{ "location": { "uri": "</xsl:text>
        <xsl:value-of select="substring-after($checkedFile/@uri, $uriBase)"/>
        <xsl:text>", "uriBaseId": "</xsl:text>
        <xsl:value-of select="$uriBaseId"/>
        <xsl:text>" } }</xsl:text>
    </xsl:template>

    <xsl:template name="get_default_artifact">
        <xsl:param name="checkedFile"/>
        <xsl:text>{ "location": { "uri": "</xsl:text>
        <xsl:value-of select="$checkedFile/@uri"/>
        <xsl:text>" } }</xsl:text>
    </xsl:template>

    <xsl:template name="get_matching_project_path">
        <!--   Select the matched project path from tempProjectRootPathElements by uri attribute    -->
        <xsl:param name="matchingURI"/>
        <xsl:variable name="defaultProjectPath" select="$tempProjectRootPathElements/PROJECTROOT[starts-with($matchingURI, @uri)]"/>
        <xsl:choose>
            <!--    Return the matched project path    -->
            <xsl:when test="$defaultProjectPath">
                <RESULT>
                    <xsl:attribute name="name"><xsl:value-of select="$defaultProjectPath/@name"/></xsl:attribute>
                    <xsl:attribute name="uri"><xsl:value-of select="$defaultProjectPath/@uri"/></xsl:attribute>
                </RESULT>
            </xsl:when>
            <xsl:otherwise>
                <xsl:variable name="encodedProjectPath" select="$tempProjectRootPathElements/PROJECTROOT[starts-with($matchingURI, @encodedUri)]"/>
                <xsl:if test="$encodedProjectPath">
                    <RESULT>
                        <xsl:attribute name="name"><xsl:value-of select="$encodedProjectPath/@name"/></xsl:attribute>
                        <xsl:attribute name="uri"><xsl:value-of select="$encodedProjectPath/@encodedUri"/></xsl:attribute>
                    </RESULT>
                </xsl:if>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="result_physical_location">
        <xsl:text>"physicalLocation": { </xsl:text>
        <xsl:call-template name="artifact_location"/>
        <xsl:text>, </xsl:text>
        <xsl:call-template name="region">
        	<xsl:with-param name="startLine" select="@locStartln"/>
        	<xsl:with-param name="startColumn" select="@locStartPos"/>
        	<xsl:with-param name="endLine" select="@locEndLn"/>
        	<xsl:with-param name="endColumn" select="@locEndPos"/>
        </xsl:call-template>
        <xsl:text> }</xsl:text>
    </xsl:template>

    <xsl:template name="duplicated_code_locations">
        <xsl:param name="descriptors"/>

        <xsl:for-each select="$descriptors">
            <xsl:if test="position() != 1">
                <xsl:text>, </xsl:text>
            </xsl:if>
            <xsl:text>{ </xsl:text><xsl:call-template name="thread_flow_physical_loc"/><xsl:text> }</xsl:text>
        </xsl:for-each>
    </xsl:template>

    <xsl:template name="thread_flow_locations">
        <xsl:param name="descriptors"/>
        <xsl:param name="type"/>
        <xsl:param name="nestingLevel"/>

        <xsl:for-each select="$descriptors">
            <xsl:choose>
                <xsl:when test="@locType = 'sr'">
                    <xsl:variable name="pos" select="accumulator-before('thread_flow_counter')"/>
                    <xsl:if test="$pos != 1">
                        <xsl:text>, </xsl:text>
                    </xsl:if>

                    <xsl:call-template name="thread_flow_loc">
                        <xsl:with-param name="type" select="$type"/>
                        <xsl:with-param name="nestingLevel" select="$nestingLevel"/>
                    </xsl:call-template>
                    <xsl:call-template name="thread_flow_locations">
                        <xsl:with-param name="descriptors" select="./ElDescList/ElDesc"/>
                        <xsl:with-param name="type" select="$type"/>
                        <xsl:with-param name="nestingLevel" select="$nestingLevel+1"/>
                    </xsl:call-template>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:call-template name="thread_flow_locations">
                        <xsl:with-param name="descriptors" select="./ElDescList/ElDesc"/>
                        <xsl:with-param name="type" select="$type"/>
                        <xsl:with-param name="nestingLevel" select="$nestingLevel"/>
                    </xsl:call-template>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:for-each>
    </xsl:template>

    <xsl:template name="thread_flow_loc">
        <xsl:param name="type"/>
        <xsl:param name="nestingLevel"/>

        <xsl:text>{ "location": { </xsl:text>
        <xsl:call-template name="thread_flow_physical_loc"/>
        <xsl:call-template name="thread_flow_loc_msg">
            <xsl:with-param name="type" select="$type"/>
        </xsl:call-template>
        <xsl:text> }, "nestingLevel": </xsl:text><xsl:value-of select="$nestingLevel" />
        <xsl:text> }</xsl:text>
    </xsl:template>

    <xsl:template name="thread_flow_physical_loc">
        <xsl:text>"physicalLocation": { </xsl:text>
        <xsl:call-template name="artifact_location"/>
        <xsl:text>, </xsl:text>
        <xsl:call-template name="region">
        	<xsl:with-param name="startLine" select="@srcRngStartln"/>
        	<xsl:with-param name="startColumn" select="@srcRngStartPos"/>
        	<xsl:with-param name="endLine" select="@srcRngEndLn"/>
        	<xsl:with-param name="endColumn" select="@srcRngEndPos"/>
        </xsl:call-template>
        <xsl:text> }</xsl:text>
    </xsl:template>

    <xsl:template name="thread_flow_loc_msg">
        <xsl:param name="type"/>

        <xsl:choose>
            <xsl:when test="$type='DupViol'">
                <xsl:text>, "message": { "text": "Review duplicate in" }</xsl:text>
            </xsl:when>
            <xsl:otherwise>
                <xsl:if test="count(Anns/Ann) > 0">
                    <xsl:text>, "message": { "text": "</xsl:text>
                    <xsl:for-each select="Anns/Ann">
                        <xsl:if test="(@kind = 'cause')">
                            <xsl:text>Violation Cause - </xsl:text>
                            <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@msg"/></xsl:call-template>
                        </xsl:if>
                        <xsl:if test="(@kind = 'point')">
                            <xsl:text>Violation Point - </xsl:text>
                            <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@msg"/></xsl:call-template>
                        </xsl:if>
                    </xsl:for-each>
                    <xsl:for-each select="Anns/Ann">
                        <xsl:if test="(@kind != 'cause' and @kind !='point')">
                            <xsl:text>  *** </xsl:text>
                            <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="@msg"/></xsl:call-template>
                        </xsl:if>
                    </xsl:for-each>
                    <xsl:text>" }</xsl:text>
                </xsl:if>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="artifact_location">
        <xsl:text>"artifactLocation": {</xsl:text>
        <xsl:variable name="locRef" select="@locRef"/>
        <xsl:variable name="locFile" select="@locFile"/>
        <xsl:choose>
            <xsl:when test="$locRef">
                <!-- Use @locRef to match <Loc> node. @locRef presents in most reports which use new schema. -->
                <xsl:variable name="locNode" select="/ResultsSession/Scope/Locations/Loc[@locRef=$locRef]"/>
                <xsl:choose>
                    <xsl:when test="$locNode">
                        <!-- Found <Loc> node matches with current violation -->
                        <xsl:variable name="matchedProjectRootPath">
                            <!--  Get matching project root path with current <Loc> -->
                            <xsl:call-template name="get_matching_project_path">
                                <xsl:with-param name="matchingURI" select="$locNode/@uri"/>
                            </xsl:call-template>
                        </xsl:variable>
                        <xsl:variable name="isAnyMatched" select="$matchedProjectRootPath/RESULT"/>
                        <xsl:choose>
                            <xsl:when test="$isAnyMatched">
                                <!-- Use relative uri when the uri has matching project root path -->
                                <xsl:call-template name="relative_artifact_location">
                                    <xsl:with-param name="uri" select="substring-after($locNode/@uri, $matchedProjectRootPath/RESULT/@uri)"/>
                                    <xsl:with-param name="uriBaseId" select="$matchedProjectRootPath/RESULT/@name"/>
                                </xsl:call-template>
                            </xsl:when>
                            <xsl:otherwise>
                                <!-- Use default uri when the uri doesn't have matching project root path -->
                                <xsl:call-template name="default_artifact_location">
                                    <xsl:with-param name="uri" select="$locNode/@uri"/>
                                </xsl:call-template>
                            </xsl:otherwise>
                        </xsl:choose>
                    </xsl:when>
                    <xsl:otherwise>
                        <!-- No <Loc> matches with current violation -->
                        <xsl:call-template name="default_artifact_location">
                            <xsl:with-param name="uri" select="$locFile"/>
                        </xsl:call-template>
                    </xsl:otherwise>
                </xsl:choose>
            </xsl:when>
            <xsl:otherwise>
                <!-- Use @locFile to match <Loc> node since @locRef doesn't present in reports which use old schema.
                     e.g. cppTest professional report (not for additional reports generated since version 2024.1) -->
                <xsl:variable name="locNode" select="/ResultsSession/Locations/Loc[@loc=$locFile]"/>
                <xsl:choose>
                    <xsl:when test="$locNode">
                        <!-- Found <Loc> node matches with current violation -->
                        <xsl:variable name="processedFsPath" select="translate($locNode/@fsPath, '\', '/')"/>
                        <xsl:variable name="processedProjectRootPath" select="$tempProjectRootPathElements/PROJECTROOT[starts-with($processedFsPath, @uri)]"/>
                        <xsl:choose>
                            <xsl:when test="$processedProjectRootPath">
                                <!-- Use relative uri when the uri has matching project root path -->
                                <xsl:call-template name="relative_artifact_location">
                                    <xsl:with-param name="uri" select="substring-after($processedFsPath, $processedProjectRootPath/@uri)"/>
                                    <xsl:with-param name="uriBaseId" select="$processedProjectRootPath/@name"/>
                                </xsl:call-template>
                            </xsl:when>
                            <xsl:otherwise>
                                <!-- Use default uri when the uri doesn't have matching project root path -->
                                <xsl:call-template name="default_artifact_location">
                                    <xsl:with-param name="uri" select="$processedFsPath"/>
                                </xsl:call-template>
                            </xsl:otherwise>
                        </xsl:choose>
                    </xsl:when>
                    <xsl:otherwise>
                        <!-- No <Loc> matches with current violation -->
                        <xsl:call-template name="default_artifact_location">
                            <xsl:with-param name="uri" select="$locFile"/>
                        </xsl:call-template>
                    </xsl:otherwise>
                </xsl:choose>
            </xsl:otherwise>
        </xsl:choose>
        <xsl:text> }</xsl:text>
    </xsl:template>

    <xsl:template name="default_artifact_location">
        <xsl:param name="uri"/>
        <xsl:text>"uri": "</xsl:text>
        <xsl:value-of select="$uri"/>
        <xsl:text>"</xsl:text>
    </xsl:template>

    <xsl:template name="relative_artifact_location">
        <xsl:param name="uri"/>
        <xsl:param name="uriBaseId"/>
        <xsl:text>"uri": "</xsl:text>
        <xsl:value-of select="$uri"/>
        <xsl:text>", "uriBaseId": "</xsl:text>
        <xsl:value-of select="$uriBaseId"/>
        <xsl:text>"</xsl:text>
    </xsl:template>

    <xsl:template name="getEncodedPath">
        <xsl:param name="path"/>
        <xsl:value-of select="replace(replace($path, '%', '%25'), ' ', '%20')"/>
    </xsl:template>

    <!-- TODO optimize -->
    <xsl:template name="location_uri">
        <xsl:param name="isMainLocation"/>

        <xsl:variable name="locRef" select="@locRef"/>
        <xsl:variable name="locNode" select="/ResultsSession/Scope/Locations/Loc[@locRef=$locRef]"/>

        <xsl:if test="$locNode/@scPath and $locNode/@repRef">
            <xsl:variable name="repNode" select="/ResultsSession/Scope/Repositories/Rep[@repRef=$locNode/@repRef]"/>
            <xsl:value-of select="$repNode/@url" />
            <xsl:text>?path=</xsl:text><xsl:value-of select="$locNode/@scPath" />

            <xsl:choose>
                <xsl:when test="$isMainLocation = 'true'">
                    <xsl:call-template name="region_params">
                        <xsl:with-param name="startLine" select="@locStartln"/>
                        <xsl:with-param name="startColumn" select="@locStartPos"/>
                        <xsl:with-param name="endLine" select="@locEndLn"/>
                        <xsl:with-param name="endColumn" select="@locEndPos"/>
                    </xsl:call-template>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:call-template name="region_params">
                        <xsl:with-param name="startLine" select="@srcRngStartln"/>
                        <xsl:with-param name="startColumn" select="@srcRngStartPos"/>
                        <xsl:with-param name="endLine" select="@srcRngEndLn"/>
                        <xsl:with-param name="endColumn" select="@srcRngEndPos"/>
                    </xsl:call-template>
                </xsl:otherwise>
            </xsl:choose>
            <xsl:if test="$locNode/@branch">
                <xsl:text>&amp;version=GB</xsl:text><xsl:value-of select="$locNode/@branch" />
            </xsl:if>
            <xsl:text>&amp;lineStyle=plain&amp;_a=contents</xsl:text>
        </xsl:if>

    </xsl:template>

    <xsl:template name="region">
        <xsl:param name="startLine"/>
        <xsl:param name="startColumn"/>
        <xsl:param name="endLine"/>
        <xsl:param name="endColumn"/>

        <xsl:if test="$startLine > 0">

            <xsl:text>"region": { "startLine": </xsl:text>
            <xsl:value-of select="$startLine" />

            <xsl:text>, "startColumn": </xsl:text>
            <xsl:choose>
                <xsl:when test="number($startColumn) > 0">
                    <xsl:value-of select="$startColumn + 1" />
                </xsl:when>
                <xsl:otherwise>
                    <xsl:text>1</xsl:text>
                </xsl:otherwise>
            </xsl:choose>

            <xsl:choose>
                <xsl:when test="number($endColumn) > 0">
                    <!-- change the condition here: In some condition, saxonJS can't compare the two variable correctly-->
                    <xsl:if test="($endLine - $startLine) > 0">
                        <xsl:text>, "endLine": </xsl:text>
                        <xsl:value-of select="$endLine" />
                    </xsl:if>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:if test="($endLine - 1) > $startLine">
                        <xsl:text>, "endLine": </xsl:text>
                        <xsl:value-of select="$endLine - 1" />
                    </xsl:if>
                </xsl:otherwise>
            </xsl:choose>

            <xsl:if test="number($endColumn) > 0">
                <xsl:text>, "endColumn": </xsl:text>
                <xsl:value-of select="$endColumn + 1" />
            </xsl:if>
            <xsl:text> }</xsl:text>

        </xsl:if>
    </xsl:template>

    <xsl:template name="region_params">
        <xsl:param name="startLine"/>
        <xsl:param name="startColumn"/>
        <xsl:param name="endLine"/>
        <xsl:param name="endColumn"/>

        <xsl:if test="$startLine > 0">

            <xsl:text>&amp;line=</xsl:text>
            <xsl:value-of select="$startLine" />

            <xsl:text>&amp;lineStartColumn=</xsl:text>
            <xsl:choose>
                <xsl:when test="$startColumn > 0">
                    <xsl:value-of select="$startColumn + 1" />
                </xsl:when>
                <xsl:otherwise>
                    <xsl:text>1</xsl:text>
                </xsl:otherwise>
            </xsl:choose>

            <xsl:choose>
                <xsl:when test="$endColumn > 0">
                    <xsl:if test="$endLine > $startLine">
                        <xsl:text>&amp;lineEnd=</xsl:text>
                        <xsl:value-of select="$endLine" />
                    </xsl:if>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:if test="$endLine - 1 > $startLine">
                        <xsl:text>&amp;lineEnd=</xsl:text>
                        <xsl:value-of select="$endLine - 1" />
                    </xsl:if>
                </xsl:otherwise>
            </xsl:choose>

            <xsl:if test="$endColumn > 0">
                <xsl:text>&amp;lineEndColumn=</xsl:text>
                <xsl:value-of select="$endColumn + 1" />
            </xsl:if>

        </xsl:if>
    </xsl:template>

    <xsl:template name="get_last_path_segment">
        <xsl:param name="path" />

        <xsl:variable name="lastSegment1">
	        <xsl:call-template name="substring_after_last">
	            <xsl:with-param name="haystack" select="$path"/>
	            <xsl:with-param name="needle" select="'/'"/>
	        </xsl:call-template>
        </xsl:variable>
        <xsl:variable name="lastSegment">
            <xsl:call-template name="substring_after_last">
                <xsl:with-param name="haystack" select="$lastSegment1"/>
                <xsl:with-param name="needle" select="'\'"/>
            </xsl:call-template>
        </xsl:variable>
        <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="$lastSegment"/></xsl:call-template>
    </xsl:template>

    <xsl:template name="substring_after_last">
        <xsl:param name="haystack" />
        <xsl:param name="needle" />

        <xsl:variable name="substring" select="substring-after($haystack,$needle)"/>
        <xsl:choose>
            <xsl:when test="string-length($substring)=0">
                <xsl:value-of select="$haystack" />
            </xsl:when>
            <xsl:otherwise>
                <xsl:call-template name="substring_after_last">
                    <xsl:with-param name="haystack" select="$substring"/>
                    <xsl:with-param name="needle" select="$needle"/>
                </xsl:call-template>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="escape_illegal_chars">
        <xsl:param name="text" />

        <xsl:call-template name="escape_chars">
            <xsl:with-param name="text" select="$text"/>
            <xsl:with-param name="escapePrefix">\</xsl:with-param>
            <xsl:with-param name="charsToEscape" select="$illegalChars"/>
            <xsl:with-param name="replacements" select="$illegalCharReplacements"/>
            <xsl:with-param name="illegalChar" select="substring($illegalChars,1,1)"/>
        </xsl:call-template>
    </xsl:template>

    <xsl:template name="escape_markdown_chars">
        <xsl:param name="text" />

        <xsl:variable name="text_without_illegal_chars">
            <xsl:call-template name="escape_illegal_chars"><xsl:with-param name="text" select="$text"/></xsl:call-template>
        </xsl:variable>

        <xsl:call-template name="escape_chars">
            <xsl:with-param name="text" select="$text_without_illegal_chars"/>
            <xsl:with-param name="escapePrefix">\\</xsl:with-param>
            <xsl:with-param name="charsToEscape" select="$markdownChars"/>
            <xsl:with-param name="replacements" select="$markdownChars"/>
            <xsl:with-param name="illegalChar" select="substring($markdownChars,1,1)"/>
        </xsl:call-template>
    </xsl:template>

    <xsl:template name="escape_chars">
        <xsl:param name="text" />
        <xsl:param name="escapePrefix" />
        <xsl:param name="charsToEscape" />
        <xsl:param name="replacements" />
        <xsl:param name="illegalChar" />

        <xsl:choose>
            <xsl:when test="$illegalChar = ''">
                <xsl:value-of select="$text"/>
            </xsl:when>
            <xsl:when test="contains($text,$illegalChar)">
                <xsl:call-template name="escape_chars">
                    <xsl:with-param name="text" select="substring-before($text,$illegalChar)"/>
                    <xsl:with-param name="escapePrefix" select="$escapePrefix"/>
                    <xsl:with-param name="charsToEscape" select="$charsToEscape"/>
                    <xsl:with-param name="replacements" select="$replacements"/>
                    <xsl:with-param name="illegalChar" select="substring(substring-after($charsToEscape,$illegalChar),1,1)"/>
                </xsl:call-template>
                <xsl:value-of select="$escapePrefix"/>
                <xsl:value-of select="translate($illegalChar,$charsToEscape,$replacements)"/>
                <xsl:call-template name="escape_chars">
                    <xsl:with-param name="text" select="substring-after($text,$illegalChar)"/>
                    <xsl:with-param name="escapePrefix" select="$escapePrefix"/>
                    <xsl:with-param name="charsToEscape" select="$charsToEscape"/>
                    <xsl:with-param name="replacements" select="$replacements"/>
                    <xsl:with-param name="illegalChar" select="$illegalChar"/>
                </xsl:call-template>
            </xsl:when>
            <xsl:otherwise>
                <xsl:call-template name="escape_chars">
                    <xsl:with-param name="text" select="$text"/>
                    <xsl:with-param name="escapePrefix" select="$escapePrefix"/>
                    <xsl:with-param name="charsToEscape" select="$charsToEscape"/>
                    <xsl:with-param name="replacements" select="$replacements"/>
                    <xsl:with-param name="illegalChar" select="substring(substring-after($charsToEscape,$illegalChar),1,1)"/>
                </xsl:call-template>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="severity_level">
        <xsl:param name="parsoft_severity"/>

        <xsl:text>"level": "</xsl:text>
        <xsl:choose>
            <xsl:when test="(($parsoft_severity='1') or ($parsoft_severity='2'))">
                <xsl:text>error</xsl:text>
            </xsl:when>
            <xsl:when test="(($parsoft_severity='3') or ($parsoft_severity='4'))">
                <xsl:text>warning</xsl:text>
            </xsl:when>
            <xsl:when test="($parsoft_severity='5')">
               <xsl:text>note</xsl:text>
            </xsl:when>
            <xsl:otherwise>
               <xsl:text>none</xsl:text>
            </xsl:otherwise>
        </xsl:choose>
        <xsl:text>"</xsl:text>
    </xsl:template>

    <xsl:template name="security_severity_level">
        <xsl:param name="parasoft_severity"/>

        <xsl:text>, "security-severity": "</xsl:text>
        <xsl:choose>
            <xsl:when test="$parasoft_severity='1'">
                <xsl:text>9.5</xsl:text>
            </xsl:when>
            <xsl:when test="$parasoft_severity='2'">
                <xsl:text>8</xsl:text>
            </xsl:when>
            <xsl:when test="$parasoft_severity='3'">
                <xsl:text>6</xsl:text>
            </xsl:when>
            <xsl:when test="$parasoft_severity='4'">
                <xsl:text>4</xsl:text>
            </xsl:when>
            <xsl:when test="$parasoft_severity='5'">
                <xsl:text>2</xsl:text>
            </xsl:when>
            <xsl:otherwise>
                <xsl:text>0</xsl:text>
            </xsl:otherwise>
        </xsl:choose>
        <xsl:text>"</xsl:text>
    </xsl:template>

    <xsl:template name="flow_viol_markdown">
        <xsl:call-template name="flow_viol_elem_markdown">
            <xsl:with-param name="descriptors" select="./ElDescList/ElDesc"/>
            <xsl:with-param name="extraSpace"/>
        </xsl:call-template>
    </xsl:template>

    <xsl:template name="flow_viol_elem_markdown">
        <xsl:param name="descriptors"/>
        <xsl:param name="extraSpace"/>
        
        <xsl:for-each select="$descriptors">
            <xsl:value-of select="$markdownNewLine" />
<!--             Cause / Point -->
            <xsl:value-of select="$extraSpace"/>

            <xsl:for-each select="Anns/Ann">
                <xsl:if test="(@kind = 'cause')">
                    <xsl:text>**</xsl:text><xsl:call-template name="escape_markdown_chars"><xsl:with-param name="text" select="@msg" /></xsl:call-template><xsl:text>**</xsl:text>
                    <xsl:value-of select="$markdownNewLine" />
                    <xsl:value-of select="$extraSpace"/>
                </xsl:if>
                <xsl:if test="(@kind = 'point')">
                    <xsl:text>**</xsl:text><xsl:call-template name="escape_markdown_chars"><xsl:with-param name="text" select="@msg" /></xsl:call-template><xsl:text>**</xsl:text>
                    <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                    <xsl:value-of select="$markdownNewLine" />
                    <xsl:value-of select="$extraSpace"/>
                </xsl:if>
            </xsl:for-each>

<!--             JAVA ? -->
            <xsl:if test="string-length(@ln) > 0">
            
                <xsl:variable name="locationUri">
                    <xsl:call-template name="location_uri"><xsl:with-param name="isMainLocation">false</xsl:with-param></xsl:call-template>
                </xsl:variable>
                <xsl:choose>
                    <xsl:when test="string-length($locationUri) > 0">
                        <xsl:text>[</xsl:text>
                        <xsl:call-template name="get_last_path_segment"><xsl:with-param name="path" select="@srcRngFile"/></xsl:call-template>
                        <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                        <xsl:text>(</xsl:text><xsl:value-of select="@ln"/><xsl:text>)</xsl:text>
                        <xsl:text>](</xsl:text>
                        <xsl:value-of select="$locationUri" />
                        <xsl:text>)</xsl:text>
                    </xsl:when>
                    <xsl:otherwise>
                        <xsl:call-template name="get_last_path_segment"><xsl:with-param name="path" select="@srcRngFile"/></xsl:call-template>
                        <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                        <xsl:text>(</xsl:text><xsl:value-of select="@ln"/><xsl:text>)</xsl:text>
                    </xsl:otherwise>
                </xsl:choose>
                
                <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                <xsl:text>:</xsl:text>
                <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
            </xsl:if>
            
<!--             code -->
            <xsl:choose>
                <xsl:when test="(@ElType = '.')">
                        <xsl:call-template name="escape_markdown_chars"><xsl:with-param name="text" select="@desc"/></xsl:call-template>
                </xsl:when>
                <xsl:otherwise>
                        <xsl:call-template name="escape_markdown_chars"><xsl:with-param name="text" select="@desc"/></xsl:call-template>
                </xsl:otherwise>
            </xsl:choose>
            <xsl:for-each select="Anns/Ann">
                    <xsl:if test="(@kind != 'cause' and @kind !='point')">
                        <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                        <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                        <xsl:text>_\\*\\*\\*</xsl:text>
                        <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                        <xsl:call-template name="escape_markdown_chars"><xsl:with-param name="text" select="@msg"/></xsl:call-template>
                        <xsl:text>_</xsl:text>
                    </xsl:if>
            </xsl:for-each>
<!--             entering to method -->
            <xsl:call-template name="flow_viol_elem_markdown">
                <xsl:with-param name="descriptors" select="ElDescList/ElDesc"/>
                <xsl:with-param name="extraSpace" select="concat($extraSpace, '&#160;&#160;&#160;&#160;&#160;&#160;&#160;&#160;')"/>
            </xsl:call-template>
        </xsl:for-each>
    </xsl:template>

    <xsl:template name="dup_viol_markdown">
        <xsl:for-each select="ElDescList/ElDesc[string-length(@supp)=0]">
            <xsl:value-of select="$markdownNewLine" />
            <xsl:choose>
                <xsl:when test="string-length(@ln) > 0">
                    <xsl:text>Review duplicate in:</xsl:text>
                    <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                    <xsl:variable name="locationUri">
                        <xsl:call-template name="location_uri"><xsl:with-param name="isMainLocation">false</xsl:with-param></xsl:call-template>
                    </xsl:variable>
                    <xsl:choose>
                        <xsl:when test="string-length($locationUri) > 0">
                            <xsl:text>[</xsl:text>
                            <xsl:call-template name="get_last_path_segment"><xsl:with-param name="path" select="@srcRngFile"/></xsl:call-template>
                            <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                            <xsl:text>(</xsl:text><xsl:value-of select="@ln"/><xsl:text>)</xsl:text>
                            <xsl:text>](</xsl:text>
                            <xsl:value-of select="$locationUri" />
                            <xsl:text>)</xsl:text>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:call-template name="get_last_path_segment"><xsl:with-param name="path" select="@srcRngFile"/></xsl:call-template>
                            <xsl:value-of select="($nbsp)" disable-output-escaping="yes"/>
                            <xsl:text>(</xsl:text><xsl:value-of select="@ln"/><xsl:text>)</xsl:text>
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:value-of select="@desc"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:for-each>
    </xsl:template>

</xsl:stylesheet>