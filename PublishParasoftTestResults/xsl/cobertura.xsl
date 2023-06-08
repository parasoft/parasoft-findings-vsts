<?xml version="1.0" encoding="UTF-8"  standalone="yes"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xsl:variable name="toolName" select="/Coverage/@toolId"/>
    <xsl:variable name="pipelineBuildWorkingDirectory" select="/Coverage/@pipelineBuildWorkingDirectory"/>
    <xsl:template match="/">
        <xsl:element name="coverage">
            <xsl:attribute name="line-rate">
                <xsl:call-template name="getLineRate">
                    <xsl:with-param name="parentsOfLines" select="/Coverage/Locations/Loc"/>
                </xsl:call-template>
            </xsl:attribute>
            <xsl:attribute name="branch-rate">0.5</xsl:attribute>
            <xsl:attribute name="lines-covered">6</xsl:attribute>
            <xsl:attribute name="lines-valid">7</xsl:attribute>
            <xsl:attribute name="branches-covered">1</xsl:attribute>
            <xsl:attribute name="version">gcovr 6.0</xsl:attribute>
            <xsl:call-template name="packages"/>
        </xsl:element>
    </xsl:template>

    <xsl:template name="packages">
        <xsl:element name="packages">
            <xsl:for-each-group select="/Coverage/Locations/Loc" group-by="substring-before(@uri, tokenize(@uri, '/')[last()])">
                <xsl:element name="package">
                    <xsl:variable name="packageName">
                        <xsl:call-template name="getPackageName">
                            <xsl:with-param name="projectPath" select="substring-after(@uri, concat(translate($pipelineBuildWorkingDirectory, '\', '/'), '/'))"/>
                        </xsl:call-template>
                    </xsl:variable>
                    <xsl:attribute name="name">
                        <xsl:value-of select="$packageName"/>
                    </xsl:attribute>
                    <xsl:attribute name="line-rate">
                        <xsl:call-template name="getLineRate">
                            <xsl:with-param name="parentsOfLines" select="current-group()"/>
                        </xsl:call-template>
                    </xsl:attribute>
                    <xsl:element name="classes">
                        <xsl:for-each select="current-group()">
                            <xsl:variable name="filePath">
                               <xsl:value-of select="substring-after(@uri, concat(translate($pipelineBuildWorkingDirectory, '\', '/'), '/'))"/>
                            </xsl:variable>
                            <xsl:element name="class">
                                <xsl:attribute name="filename">
                                    <xsl:value-of select="$filePath"/>
                                </xsl:attribute>
                                <xsl:attribute name="line-rate">
                                    <xsl:call-template name="getLineRate">
                                        <xsl:with-param name="parentsOfLines" select="."/>
                                    </xsl:call-template>
                                </xsl:attribute>
                                <xsl:attribute name="name">
                                    <xsl:call-template name="getClassName">
                                        <xsl:with-param name="packageName" select="$packageName"/>
                                        <xsl:with-param name="filePath" select="$filePath"/>
                                    </xsl:call-template>
                                </xsl:attribute>
                                <xsl:element name="lines">
                                    <xsl:call-template name="addLinesElem">
                                        <xsl:with-param name="locRefValue" select="@locRef"/>
                                    </xsl:call-template>
                                </xsl:element>
                            </xsl:element>
                        </xsl:for-each>
                    </xsl:element>
                </xsl:element>
            </xsl:for-each-group>
        </xsl:element>
    </xsl:template>

    <xsl:template name="getLineRate">
        <xsl:param name="parentsOfLines"/>
        <xsl:variable name="totalLines" as="xs:integer*">
            <xsl:for-each select="$parentsOfLines">
                <xsl:variable name="lineNumbers" as="xs:string*">
                    <xsl:call-template name="getLineNumbers">
                        <xsl:with-param name="locRefValue" select="@locRef"/>
                    </xsl:call-template>
                </xsl:variable>
                <xsl:sequence select="count($lineNumbers)"/>
            </xsl:for-each>
        </xsl:variable>

        <xsl:variable name="coveredLines" as="xs:integer*">
            <xsl:for-each select="$parentsOfLines">
                <xsl:variable name="coveredLineNumbers" as="xs:string*">
                    <xsl:call-template name="getCoveredLineNumbers">
                        <xsl:with-param name="locRefValue" select="@locRef"/>
                    </xsl:call-template>
                </xsl:variable>
                <xsl:sequence select="count(distinct-values($coveredLineNumbers))"/>
            </xsl:for-each>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="sum($totalLines) > 0">
                <xsl:value-of select="sum($coveredLines) div sum($totalLines)"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="0"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="getPackageName">
        <xsl:param name="projectPath"/>
        <xsl:variable name="delimiter" select="'/'"/>
        <xsl:variable name="segments" select="tokenize(@uri, '/')"/>
        <xsl:choose>
            <xsl:when test="count($segments) > 1">
                <xsl:variable name="filename">
                     <xsl:value-of select="$segments[last()]"/>
                </xsl:variable>
                <xsl:choose>
                    <!--    Jtest    -->
                    <xsl:when test="$toolName = 'jtest'">
                        <xsl:variable name="packageNamePrefix">
                            <xsl:call-template name="getPackageNamePrefix">
                                <xsl:with-param name="projId" select="@projId"/>
                            </xsl:call-template>
                        </xsl:variable>
                        <xsl:choose>
                            <xsl:when test="contains($projectPath, translate($packageNamePrefix, '.', '/'))">
                                <xsl:variable name="formattedResourceProjectPath" select="replace(substring-before($projectPath, concat($delimiter, $filename)), $delimiter, '.')"/>
                                <xsl:value-of select="substring-after($formattedResourceProjectPath, substring-before($formattedResourceProjectPath, $packageNamePrefix))"/>
                            </xsl:when>
                            <xsl:otherwise>
                                <xsl:value-of select="'&lt;none&gt;'"/>
                            </xsl:otherwise>
                        </xsl:choose>
                    </xsl:when>
                    <!--     Dottest  or CPPTest std     -->
                    <xsl:when test="$toolName = 'dottest' or $toolName = 'c++test'">
                        <xsl:value-of select="substring-before($projectPath, concat($delimiter, $filename))"/>
                    </xsl:when>
                </xsl:choose>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="'&lt;none&gt;'"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="getPackageNamePrefix">
        <xsl:param name="projId"/>
        <xsl:choose>
            <xsl:when test="contains($projId, ':')">
                <xsl:value-of select="substring-before($projId, ':')"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$projId"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="getClassName">
        <xsl:param name="packageName"/>
        <xsl:param name="filePath"/>
        <xsl:variable name="fileName" select="tokenize($filePath, '/')[last()]"/>
        <xsl:variable name="className">
            <xsl:choose>
                <xsl:when test="$toolName = 'c++test'">
                    <xsl:value-of select="$fileName"/>
                </xsl:when>
                <xsl:otherwise>
                    <!--To remove file extension-->
                    <xsl:value-of select="substring-before($fileName, '.')"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="$toolName = 'jtest' and $packageName != '&lt;none&gt;'">
                <xsl:value-of select="concat($packageName, '.', $className)"/>
            </xsl:when>
             <xsl:otherwise>
                <xsl:value-of select="$className"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="addLinesElem">
        <xsl:param name="locRefValue"/>
        <xsl:variable name="lineNumbers" as="xs:string*">
            <xsl:call-template name="getLineNumbers">
                <xsl:with-param name="locRefValue" select="$locRefValue"/>
            </xsl:call-template>
        </xsl:variable>
        <xsl:variable name="coveredLineNumbers" as="xs:string*">
            <xsl:call-template name="getCoveredLineNumbers">
                <xsl:with-param name="locRefValue" select="$locRefValue"/>
            </xsl:call-template>
        </xsl:variable>

        <xsl:for-each select="$lineNumbers">
            <xsl:sort data-type="number"/>
            <xsl:element name="line">
                <xsl:attribute name="number">
                    <xsl:value-of select="."/>
                </xsl:attribute>
                <xsl:attribute name="hits">
                    <xsl:choose>
                        <xsl:when test=". = $coveredLineNumbers">
                            <xsl:variable name="currentLine" select="."/>
                            <xsl:value-of select="count($coveredLineNumbers[. = $currentLine])"/>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:value-of select="0"/>
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:attribute>
            </xsl:element>
        </xsl:for-each>
    </xsl:template>

    <xsl:template name="getLineNumbers">
        <xsl:param name="locRefValue"/>
        <xsl:variable name="statCvgElems" select="string-join(/Coverage/CoverageData/CvgData[@locRef = $locRefValue]/Static/StatCvg/@elems, ' ')"/>
        <xsl:sequence select="distinct-values(tokenize($statCvgElems, '\s+'))"/>
    </xsl:template>

    <xsl:template name="getCoveredLineNumbers">
        <xsl:param name="locRefValue"/>
        <xsl:variable name="coveredLinesSeq" as="xs:string*">
            <xsl:for-each select="/Coverage/CoverageData/CvgData[@locRef = $locRefValue]/Dynamic//DynCvg">
                <xsl:sequence select="string(string-join(.//CtxCvg/@elemRefs, ' '))"/>
            </xsl:for-each>
        </xsl:variable>
        <xsl:sequence select="tokenize(string-join($coveredLinesSeq, ' '), '\s+')"/>
    </xsl:template>
</xsl:stylesheet>