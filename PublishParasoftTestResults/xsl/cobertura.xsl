<?xml version="1.0" encoding="UTF-8"  standalone="yes"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:xs="http://www.w3.org/2001/XMLSchema">
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
                    <xsl:variable name="packageName">
                        <xsl:call-template name="getPackageName">
                            <xsl:with-param name="resProjPath" select="@resProjPath"/>
                        </xsl:call-template>
                    </xsl:variable>
                    <xsl:attribute name="name">
                        <xsl:value-of select="$packageName"/>
                    </xsl:attribute>
                    <xsl:element name="classes">
                        <xsl:for-each select="current-group()">
                            <xsl:variable name="filename">
                                <xsl:call-template name="getFileName"/>
                            </xsl:variable>
                            <xsl:element name="class">
                                <xsl:attribute name="filename">
                                    <xsl:value-of select="$filename"/>
                                </xsl:attribute>
                                <xsl:attribute name="name">
                                    <xsl:call-template name="getClassName">
                                        <xsl:with-param name="packageName" select="$packageName"/>
                                        <xsl:with-param name="filename" select="$filename"/>
                                    </xsl:call-template>
                                </xsl:attribute>
                            </xsl:element>
                            <xsl:call-template name="addLinesElem">
                                <xsl:with-param name="locRefValue" select="@locRef"/>
                            </xsl:call-template>
                        </xsl:for-each>
                    </xsl:element>
                </xsl:element>
            </xsl:for-each-group>
        </xsl:element>
    </xsl:template>

    <xsl:template name="getPackageName">
        <xsl:param name="resProjPath"/>
        <xsl:variable name="delimiter" select="'/'"/>
        <xsl:if test="@projId and @resProjPath">
            <xsl:variable name="filename">
                <xsl:call-template name="getFileName"/>
            </xsl:variable>
            <xsl:variable name="packageNamePrefix">
                <xsl:call-template name="getPackageNamePrefix">
                    <xsl:with-param name="projId" select="@projId"/>
                </xsl:call-template>
            </xsl:variable>
            <xsl:choose>
                <!--    Jtest    -->
                <xsl:when test="$toolName = 'jtest'">
                    <xsl:variable name="formattedResourceProjectPath" select="replace(substring-before($resProjPath, concat($delimiter, $filename)), $delimiter, '.')"/>
                    <xsl:value-of select="substring-after($formattedResourceProjectPath, substring-before($formattedResourceProjectPath, $packageNamePrefix))"/>
                </xsl:when>
                <!--     Dottest       -->
                <xsl:when test="$toolName = 'dottest'">
                    <xsl:choose>
                        <xsl:when test="contains($resProjPath, $delimiter)">
                            <xsl:value-of select="concat($packageNamePrefix, '.', replace(substring-before($resProjPath, concat($delimiter, tokenize($resProjPath, '/')[last()])), $delimiter, '.'))"/>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:value-of select="$packageNamePrefix"/>
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:when>
            </xsl:choose>
        </xsl:if>
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
        <xsl:param name="filename"/>
        <xsl:variable name="className">
            <!--To remove file extension-->
            <xsl:value-of select="substring-before($filename, '.')"/>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="string-length($packageName) > 0">
                <xsl:value-of select="concat($packageName, '.', $className)"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$className"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="getFileName">
        <xsl:value-of select="tokenize(@uri, '/')[last()]"/>
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