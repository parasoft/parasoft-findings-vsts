<?xml version="1.0"?>
    
<xsl:stylesheet version="1.1" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:saxon="http://icl.com/saxon" extension-element-prefixes="saxon">
    
    <xsl:output method="text" encoding="UTF-8" omit-xml-declaration="yes" indent="no" media-type="application/json" />
    
    <xsl:param name="skip_not_violated_rules">true</xsl:param>
    <xsl:param name="skip_suppressed">false</xsl:param>
    <xsl:param name="duplicates_as_code_flow">true</xsl:param>
    
    <xsl:variable name="qt">"</xsl:variable>
    <xsl:variable name="firstRule" saxon:assignable="yes">true</xsl:variable>
    <xsl:variable name="firstFlowLoc" saxon:assignable="yes">true</xsl:variable>
    <xsl:variable name="illegalChars" select="'\/&quot;&#xD;&#xA;&#x9;'"/>
    <xsl:variable name="illegalCharReplacements" select="'\/&quot;rnt'"/>
    <xsl:variable name="markdownChars" select="'*_{}[]()#+-.!'"/>
    <xsl:variable name="markdownNewLine">  \n</xsl:variable>
    <xsl:variable name="nbsp" select="concat('&amp;','nbsp;')" saxon:assignable="yes"/>
    
    <xsl:template match="/ResultsSession">
        <xsl:text>{ "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json", "version": "2.1.0", "runs": [ {</xsl:text>
        <xsl:text>"tool": { "driver": {</xsl:text>
        <xsl:text>"name": "</xsl:text><xsl:value-of select="@toolDispName" /><xsl:text>",</xsl:text>
        <xsl:text>"semanticVersion": "</xsl:text><xsl:value-of select="@toolVer" /><xsl:text>",</xsl:text>
        
        <xsl:text>"rules": [</xsl:text>
            <xsl:call-template name="rules_list"/>
        <xsl:text>] } }</xsl:text>
        <xsl:call-template name="version_control_provenance"/>
        <xsl:text>, "results": [</xsl:text>
            <xsl:call-template name="results"/>
            <!-- static violations list -->
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
        <xsl:variable name="tags" saxon:assignable="yes" select="concat($qt,$category_desc,$qt)"/>
        <xsl:if test="string-length($parentTags) > 0">
            <saxon:assign name="tags" select="concat($parentTags,', ',$tags)"/>
        </xsl:if>
        
        <xsl:variable name="cat" select="@name"/>
        <xsl:for-each select="/ResultsSession/CodingStandards/Rules/RulesList/Rule[@cat=($cat)]">
            <xsl:if test="$skip_not_violated_rules!='true' or string-length(@total)=0 or @total>0">
                <xsl:call-template name="rule_descr">
                    <xsl:with-param name="tags" select="$tags"/>
                </xsl:call-template>
            </xsl:if>
        </xsl:for-each>
        
        <xsl:for-each select="./Category">
            <xsl:call-template name="rules_category">
                <xsl:with-param name="parentTags" select="$tags"/>
            </xsl:call-template>
        </xsl:for-each>
        
    </xsl:template>
    
    <xsl:template name="rule_descr">
        <xsl:param name="tags"/>
        
        <xsl:choose>
            <xsl:when test="$firstRule = 'true'">
                <saxon:assign name="firstRule">false</saxon:assign>
            </xsl:when>
            <xsl:otherwise>
                <xsl:text>, </xsl:text>
            </xsl:otherwise>
        </xsl:choose>
        
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
        
        <xsl:text>, "properties": { "tags": [ </xsl:text><xsl:value-of select="$tags" /><xsl:text> ] }</xsl:text>
        <xsl:text> }</xsl:text>
    </xsl:template>
    
    <xsl:key name="distinctRepositoryIdx1" match="/ResultsSession/Scope/Locations/Loc[@repRef and not(@branch)]" use="@repRef" />
    <xsl:key name="distinctRepositoryIdx2" match="/ResultsSession/Scope/Locations/Loc[@repRef and @branch]" use="concat(@repRef,'_',@branch)" />
    
    <xsl:template name="version_control_provenance">
        <xsl:if test="count(/ResultsSession/Scope/Repositories/*) > 0">
            <xsl:text>, "versionControlProvenance": [</xsl:text>
            <xsl:variable name="firstRepo" saxon:assignable="yes">true</xsl:variable>
            <xsl:for-each select="/ResultsSession/Scope/Repositories/*">
                <xsl:variable name="url" select="@url"/>
                <xsl:variable name="repRef" select="@repRef"/>
                
                <xsl:for-each select="/ResultsSession/Scope/Locations/Loc[generate-id()=generate-id(key('distinctRepositoryIdx1',$repRef)[1])]">
                    <xsl:choose>
                        <xsl:when test="$firstRepo = 'true'">
                             <saxon:assign name="firstRepo">false</saxon:assign>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:text>, </xsl:text>
                        </xsl:otherwise>
                    </xsl:choose>
                    <xsl:text>{ "repositoryUri": "</xsl:text><xsl:value-of select="$url" /><xsl:text>"</xsl:text>
                    <xsl:text>, "mappedTo": { "uriBaseId": "ROOT_</xsl:text><xsl:value-of select="@repRef" /><xsl:text>" }</xsl:text>
                    <xsl:text> }</xsl:text>
                </xsl:for-each>
                
                <xsl:for-each select="/ResultsSession/Scope/Locations/Loc[generate-id()=generate-id(key('distinctRepositoryIdx2',concat($repRef,'_',@branch))[1])]">
                    <xsl:choose>
                        <xsl:when test="$firstRepo = 'true'">
                             <saxon:assign name="firstRepo">false</saxon:assign>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:text>, </xsl:text>
                        </xsl:otherwise>
                    </xsl:choose>
                    <xsl:text>{ "repositoryUri": "</xsl:text><xsl:value-of select="$url" /><xsl:text>"</xsl:text>
                    <xsl:text>, "branch": "</xsl:text><xsl:value-of select="@branch" /><xsl:text>"</xsl:text>
                    <xsl:text>, "mappedTo": { "uriBaseId": "ROOT_</xsl:text><xsl:value-of select="concat(@repRef,'_',@branch)" /><xsl:text>" }</xsl:text>
                    <xsl:text> }</xsl:text>
                </xsl:for-each>
            </xsl:for-each>
            <xsl:text>]</xsl:text>
        </xsl:if>
    </xsl:template>
    
    <xsl:template name="results">
        <xsl:variable name="firstResult" saxon:assignable="yes">true</xsl:variable>
        <xsl:for-each select="/ResultsSession/CodingStandards/StdViols/*">
            <xsl:if test="string-length(@supp)=0 or @supp!='true' or $skip_suppressed!='true'">
                <xsl:choose>
                    <xsl:when test="$firstResult = 'true'">
                         <saxon:assign name="firstResult">false</saxon:assign>
                    </xsl:when>
                    <xsl:otherwise>
                        <xsl:text>, </xsl:text>
                    </xsl:otherwise>
                </xsl:choose>
                <xsl:call-template name="result"/>
            </xsl:if>
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
        <xsl:if test="string-length(@lineHash) > 0">
            <xsl:text>"lineHash": "</xsl:text><xsl:value-of select="@lineHash" /><xsl:text>"</xsl:text>
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
        <saxon:assign name="firstFlowLoc">true</saxon:assign>
        <xsl:call-template name="thread_flow_locations">
            <xsl:with-param name="descriptors" select="./ElDescList/ElDesc"/>
            <xsl:with-param name="type" select="local-name()"/>
            <xsl:with-param name="nestingLevel">0</xsl:with-param>
        </xsl:call-template>
        <xsl:text> ]</xsl:text>
        <xsl:text> } ] } ]</xsl:text>
        </xsl:if>
        
        <xsl:if test="@supp='true'">
            <xsl:text>, "suppressions": [ { "kind": "external" } ]</xsl:text>
        </xsl:if>
        <xsl:text> }</xsl:text>
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
        
        <xsl:variable name="firstDupLoc" saxon:assignable="yes">true</xsl:variable>
        <xsl:for-each select="$descriptors">
            <xsl:choose>
                <xsl:when test="$firstDupLoc = 'true'">
                    <saxon:assign name="firstDupLoc">false</saxon:assign>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:text>, </xsl:text>
                </xsl:otherwise>
            </xsl:choose>
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
                    
                    <xsl:choose>
                        <xsl:when test="$firstFlowLoc = 'true'">
                            <saxon:assign name="firstFlowLoc">false</saxon:assign>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:text>, </xsl:text>
                        </xsl:otherwise>
                    </xsl:choose>
                    
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
        <xsl:text>"artifactLocation": { "uri": "</xsl:text>
        
        <xsl:variable name="uri" saxon:assignable="yes" />
        <xsl:variable name="uriBaseId" saxon:assignable="yes" />
        <xsl:variable name="locRef" select="@locRef"/>
        <xsl:variable name="locNode" select="/ResultsSession/Scope/Locations/Loc[@locRef=$locRef]"/>
        <xsl:choose>
            <xsl:when test="$locNode/@scPath">
                <saxon:assign name="uri" select="$locNode/@scPath"/>
                <saxon:assign name="uriBaseId" select="$locNode/@repRef"/>
            </xsl:when>
            <xsl:otherwise>
                <saxon:assign name="uri" select="$locNode/@uri"/>
            </xsl:otherwise>
        </xsl:choose>
        
        <xsl:value-of select="$uri" /><xsl:text>"</xsl:text>
        <xsl:if test="$uriBaseId != ''">
            <xsl:text>, "uriBaseId": "ROOT_</xsl:text><xsl:value-of select="$uriBaseId" /><xsl:text>"</xsl:text>
        </xsl:if>
        
        <xsl:text> }</xsl:text>
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
                        <xsl:text>, "endLine": </xsl:text>
                        <xsl:value-of select="$endLine" />
                    </xsl:if>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:if test="$endLine - 1 > $startLine">
                        <xsl:text>, "endLine": </xsl:text>
                        <xsl:value-of select="$endLine - 1" />
                    </xsl:if>
                </xsl:otherwise>
            </xsl:choose>
            
            <xsl:if test="$endColumn > 0">
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

    <xsl:template name="flow_viol_markdown">
        <xsl:call-template name="flow_viol_elem_markdown">
            <xsl:with-param name="descriptors" select="./ElDescList/ElDesc"/>
            <xsl:with-param name="extraSpace"></xsl:with-param>
        </xsl:call-template>
    </xsl:template>

    <xsl:template name="flow_viol_elem_markdown">
        <xsl:param name="descriptors"/>
        <xsl:param name="extraSpace"/>
        
        <xsl:for-each select="$descriptors">
            <xsl:value-of select="$markdownNewLine" />
<!--             Cause / Point -->
            <xsl:value-of select="$extraSpace"/>
            <xsl:variable name="space" saxon:assignable="yes"/>
            <saxon:assign name="space">
                <xsl:value-of select="$extraSpace"/>
                <xsl:text>&#160;</xsl:text>
                <xsl:text>&#160;</xsl:text>
                <xsl:text>&#160;</xsl:text>
                <xsl:text>&#160;</xsl:text>
                <xsl:text>&#160;</xsl:text>
                <xsl:text>&#160;</xsl:text>
                <xsl:text>&#160;</xsl:text>
                <xsl:text>&#160;</xsl:text>
            </saxon:assign>
            
            <xsl:for-each select="Anns/Ann">
                <xsl:if test="(@kind = 'cause')">
                    <xsl:text>**</xsl:text><xsl:value-of select="@msg"/><xsl:text>**</xsl:text>
                    <xsl:value-of select="$markdownNewLine" />
                    <xsl:value-of select="$extraSpace"/>
                </xsl:if>
                <xsl:if test="(@kind = 'point')">
                    <xsl:text>**</xsl:text><xsl:value-of select="@msg"/><xsl:text>**</xsl:text>
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
                <xsl:with-param name="extraSpace" select="$space"/>
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