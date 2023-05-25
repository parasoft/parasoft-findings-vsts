<?xml version="1.0" encoding="UTF-8"  standalone="yes"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
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
            <xsl:apply-templates select="/Coverage/Locations/Loc" mode="package"/>
        </xsl:element>
    </xsl:template>

    <xsl:template match="Loc" mode="package">
        <xsl:variable name="packageNameValue">
            <xsl:call-template name="callPackageNameTemplate"/>
        </xsl:variable>
        <xsl:variable name="isDuplicatePackage">
            <xsl:if test="position() != 1">
                <xsl:for-each select="preceding-sibling::*">
                    <xsl:variable name="brotherPackageName">
                        <xsl:call-template name="callPackageNameTemplate"/>
                    </xsl:variable>
                    <xsl:if test="$packageNameValue = $brotherPackageName">
                        <xsl:value-of select="'true'"/>
                    </xsl:if>
                </xsl:for-each>
            </xsl:if>
        </xsl:variable>

        <xsl:if test="position() = 1 or $isDuplicatePackage != 'true'">
            <xsl:element name="package">
                <xsl:call-template name="addPackageNameAttr"/>
                <xsl:call-template name="classes">
                    <xsl:with-param name="packageNameValue" select="$packageNameValue"/>
                </xsl:call-template>
            </xsl:element>
        </xsl:if>
    </xsl:template>

    <xsl:template name="classes">
        <xsl:param name="packageNameValue"/>
        <xsl:element name="classes">
            <xsl:apply-templates select="/Coverage/Locations/Loc" mode="class">
                <xsl:with-param name="packageNameValue" select="$packageNameValue"/>
            </xsl:apply-templates>
        </xsl:element>
    </xsl:template>

    <xsl:template match="Loc" mode="class">
        <xsl:param name="packageNameValue"/>
        <xsl:variable name="classNameValue">
            <xsl:call-template name="className"/>
        </xsl:variable>
        <xsl:variable name="delimiter">
            <xsl:if test="@projId">
                <xsl:value-of select="'.'"/>
            </xsl:if>
        </xsl:variable>
        <xsl:variable name="processedClassFilename">
            <xsl:call-template name="handleClassFilename"/>
        </xsl:variable>
        <xsl:if test="concat($packageNameValue, $delimiter, $processedClassFilename) = $classNameValue">
            <xsl:element name="class">
                <xsl:call-template name="addClassFilenameAttr"/>
                <xsl:call-template name="addClassNameAttr"/>
            </xsl:element>
        </xsl:if>
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
            <xsl:call-template name="getClassFilename"/>
        </xsl:variable>
        <xsl:variable name="processedProjId">
            <xsl:call-template name="handleProjId">
                <xsl:with-param name="projId" select="@projId"/>
            </xsl:call-template>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="contains($string, '/')">
                <xsl:call-template name="packageName">
                    <xsl:with-param name="string" select="translate(substring-before($string, concat($delimiter, $classFilenameValue)), $delimiter, '.')"/>
                    <xsl:with-param name="delimiter" select="'.'"/>
                </xsl:call-template>
            </xsl:when>
            <xsl:when test="not(starts-with($string, $processedProjId))">
                <xsl:call-template name="packageName">
                    <xsl:with-param name="string" select="substring-after($string, $delimiter)"/>
                    <xsl:with-param name="delimiter" select="'.'"/>
                </xsl:call-template>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$string"/>
            </xsl:otherwise>
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
            <xsl:call-template name="getClassFilename"/>
        </xsl:attribute>
    </xsl:template>

    <xsl:template name="addClassNameAttr">
        <xsl:attribute name="name">
            <xsl:call-template name="className"/>
        </xsl:attribute>
    </xsl:template>

    <xsl:template name="className">
        <xsl:variable name="packageNameValue">
            <xsl:call-template name="callPackageNameTemplate"/>
        </xsl:variable>
        <xsl:variable name="processedClassFilename">
            <xsl:call-template name="handleClassFilename"/>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="@projId">
                <xsl:value-of select="concat($packageNameValue, '.', $processedClassFilename)"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$processedClassFilename"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="handleClassFilename">
        <xsl:variable name="classFilename">
            <xsl:call-template name="getClassFilename"/>
        </xsl:variable>
        <xsl:value-of select="substring-before($classFilename, '.')"/>
    </xsl:template>

    <xsl:template name="getClassFilename">
        <xsl:call-template name="classFilename">
            <xsl:with-param name="string" select="@uri"/>
            <xsl:with-param name="delimiter" select="'/'"/>
        </xsl:call-template>
    </xsl:template>

    <xsl:template name="callPackageNameTemplate">
        <xsl:choose>
            <xsl:when test="@projId">
                <xsl:call-template name="packageName">
                    <xsl:with-param name="string" select="@uri"/>
                    <xsl:with-param name="delimiter" select="'/'"/>
                </xsl:call-template>
            </xsl:when>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="classFilename">
        <xsl:param name="string"/>
        <xsl:param name="delimiter"/>
        <xsl:choose>
            <xsl:when test="contains($string, $delimiter)">
                <xsl:call-template name="classFilename">
                    <xsl:with-param name="string" select="substring-after($string, $delimiter)"/>
                    <xsl:with-param name="delimiter" select="$delimiter"/>
                </xsl:call-template>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$string"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
</xsl:stylesheet>