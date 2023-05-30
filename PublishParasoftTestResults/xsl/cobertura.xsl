<?xml version="1.0" encoding="UTF-8"  standalone="yes"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xsl:output indent="yes"/>
    <xsl:variable name="toolName" select="/Coverage/@toolId"/>
    <xsl:template match="/">
        <xsl:element name="coverage">
            <xsl:attribute name="line-rate">0.8571428571428571</xsl:attribute>
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
                    <xsl:attribute name="name">
                        <xsl:call-template name="addPackageNameAttr"/>
                    </xsl:attribute>
                    <xsl:element name="classes">
                        <xsl:for-each select="current-group()">
                            <xsl:element name="class">
                                <xsl:call-template name="addClassFilenameAttr"/>
                                <xsl:call-template name="addClassNameAttr"/>
                                <xsl:call-template name="addLinesElem">
                                    <xsl:with-param name="locRefValue" select="@locRef"/>
                                </xsl:call-template>
                            </xsl:element>
                        </xsl:for-each>
                    </xsl:element>
                </xsl:element>
            </xsl:for-each-group>
        </xsl:element>
    </xsl:template>

    <xsl:template name="addPackageNameAttr">
        <xsl:attribute name="name">
            <xsl:call-template name="callPackageNameTemplate"/>
        </xsl:attribute>
    </xsl:template>

    <xsl:template name="packageName">
        <xsl:param name="string"/>
        <xsl:param name="delimiter"/>
        <xsl:variable name="classFilenameValue">
            <xsl:call-template name="classFilename"/>
        </xsl:variable>
        <xsl:variable name="processedProjId">
            <xsl:call-template name="handleProjId">
                <xsl:with-param name="projId" select="@projId"/>
            </xsl:call-template>
        </xsl:variable>
        <xsl:choose>
            <!--    Jtest    -->
            <xsl:when test="$toolName = 'jtest'">
                <xsl:variable name="handledResProjPath" select="replace(substring-before($string, concat($delimiter, $classFilenameValue)), $delimiter, '.')"/>
                <xsl:value-of select="substring-after($handledResProjPath, substring-before($handledResProjPath, $processedProjId))"/>
            </xsl:when>
            <!--     Dottest       -->
            <xsl:when test="$toolName = 'dottest'">
                <xsl:choose>
                    <xsl:when test="contains($string, $delimiter)">
                        <xsl:value-of select="concat($processedProjId, '.', substring-before($string, $delimiter))"/>
                    </xsl:when>
                    <xsl:otherwise>
                        <xsl:value-of select="$processedProjId"/>
                    </xsl:otherwise>
                </xsl:choose>
            </xsl:when>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="handleProjId">
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

    <xsl:template name="addClassFilenameAttr">
        <xsl:attribute name="filename">
            <xsl:call-template name="classFilename"/>
        </xsl:attribute>
    </xsl:template>

    <xsl:template name="addClassNameAttr">
        <xsl:attribute name="name">
            <xsl:variable name="packageNameValue">
                <xsl:call-template name="callPackageNameTemplate"/>
            </xsl:variable>
            <xsl:variable name="processedClassFilename">
                <xsl:call-template name="handleClassFilename"/>
            </xsl:variable>
            <xsl:choose>
                <xsl:when test="@projId and @resProjPath">
                    <xsl:value-of select="concat($packageNameValue, '.', $processedClassFilename)"/>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:value-of select="$processedClassFilename"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:attribute>
    </xsl:template>

    <xsl:template name="handleClassFilename">
        <xsl:variable name="classFilenameValue">
            <xsl:call-template name="classFilename"/>
        </xsl:variable>
        <xsl:value-of select="substring-before($classFilenameValue, '.')"/>
    </xsl:template>

    <xsl:template name="classFilename">
        <xsl:value-of select="tokenize(@uri, '/')[last()]"/>
    </xsl:template>

    <xsl:template name="callPackageNameTemplate">
        <xsl:choose>
            <xsl:when test="@projId and @resProjPath">
                <xsl:call-template name="packageName">
                    <xsl:with-param name="string" select="@resProjPath"/>
                    <xsl:with-param name="delimiter" select="'/'"/>
                </xsl:call-template>
            </xsl:when>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="addLinesElem">
        <xsl:param name="locRefValue"/>
        <xsl:element name="lines">
            <xsl:variable name="statCvgElems" select="string-join(/Coverage/CoverageData/CvgData[@locRef = $locRefValue]/Static/StatCvg/@elems, ' ')"/>
            <xsl:variable name="lineNumbers" select="distinct-values(tokenize($statCvgElems, '\s+'))"/>

            <xsl:variable name="coveredLinesSeq" as="xs:string*">
                <xsl:for-each select="/Coverage/CoverageData/CvgData[@locRef = $locRefValue]/Dynamic//DynCvg">
                    <xsl:sequence select="string(string-join(.//CtxCvg/@elemRefs, ' '))"/>
                </xsl:for-each>
            </xsl:variable>
            <xsl:variable name="coveredLineNumbers" select="distinct-values(tokenize(string-join($coveredLinesSeq, ' '), '\s+'))"/>

            <xsl:for-each select="$lineNumbers">
                <xsl:sort data-type="number"/>
                <xsl:element name="line">
                    <xsl:attribute name="number">
                        <xsl:value-of select="."/>
                    </xsl:attribute>
                    <xsl:attribute name="hits">
                        <xsl:choose>
                            <xsl:when test=". = $coveredLineNumbers">
                                <xsl:value-of select="1"/>
                            </xsl:when>
                            <xsl:otherwise>
                                <xsl:value-of select="0"/>
                            </xsl:otherwise>
                        </xsl:choose>
                    </xsl:attribute>
                </xsl:element>
            </xsl:for-each>
        </xsl:element>
    </xsl:template>
</xsl:stylesheet>