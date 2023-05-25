<?xml version="1.0" encoding="UTF-8"  standalone="yes"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
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
                        <xsl:call-template name="generatePackageName">
                            <xsl:with-param name="string" select="@resProjPath"/>
                        </xsl:call-template>
                    </xsl:variable>
                    <xsl:attribute name="name">
                        <xsl:value-of select="$packageName"/>
                    </xsl:attribute>
                    <xsl:element name="classes">
                        <xsl:for-each select="current-group()">
                            <xsl:variable name="classFileName">
                                <xsl:call-template name="classFilename"/>
                            </xsl:variable>
                            <xsl:element name="class">
                                <xsl:attribute name="filename">
                                    <xsl:value-of select="$classFileName"/>
                                </xsl:attribute>
                                <xsl:call-template name="addClassNameAttr">
                                    <xsl:with-param name="packageName" select="$packageName"/>
                                    <xsl:with-param name="classFilename" select="$classFileName"/>
                                </xsl:call-template>
                            </xsl:element>
                        </xsl:for-each>
                    </xsl:element>
                </xsl:element>
            </xsl:for-each-group>
        </xsl:element>
    </xsl:template>

    <xsl:template name="generatePackageName">
        <xsl:param name="string"/>
        <xsl:variable name="delimiter" select="'/'"/>
        <xsl:if test="@projId and $string">
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
        </xsl:if>
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

    <xsl:template name="addClassNameAttr">
        <xsl:param name="packageName"/>
        <xsl:param name="classFilename"/>
        <xsl:variable name="processedClassFilename">
            <xsl:value-of select="substring-before($classFilename, '.')"/>
        </xsl:variable>
        <xsl:attribute name="name">
            <xsl:choose>
                <xsl:when test="string-length($packageName) > 0">
                    <xsl:value-of select="concat($packageName, '.', $processedClassFilename)"/>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:value-of select="$processedClassFilename"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:attribute>
    </xsl:template>

    <xsl:template name="classFilename">
        <xsl:value-of select="tokenize(@uri, '/')[last()]"/>
    </xsl:template>
</xsl:stylesheet>