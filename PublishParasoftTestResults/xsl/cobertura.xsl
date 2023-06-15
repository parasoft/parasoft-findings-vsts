<?xml version="1.0" encoding="UTF-8"  standalone="yes"?>
<xsl:stylesheet version="3.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:map="http://www.w3.org/2005/xpath-functions/map">
    <xsl:variable name="toolName" select="/Coverage/@toolId"/>
    <xsl:variable name="pipelineBuildWorkingDirectory" select="/Coverage/@pipelineBuildWorkingDirectory"/>
    <xsl:template match="/">
        <xsl:element name="coverage">
            <xsl:variable name="lineRateForCoverageTag">
                <xsl:call-template name="getLineRateForClassOrPackage">
                    <xsl:with-param name="parentsOfLines" select="/Coverage/Locations/Loc"/>
                </xsl:call-template>
            </xsl:variable>
            <xsl:if test="$lineRateForCoverageTag != -1">
                <xsl:attribute name="line-rate">
                    <xsl:value-of select="$lineRateForCoverageTag"/>
                </xsl:attribute>
                <xsl:attribute name="lines-covered">6</xsl:attribute><!-- dummy value but this attribute is required  -->
                <xsl:attribute name="lines-valid">7</xsl:attribute><!-- dummy value but this attribute is required  -->
                <xsl:attribute name="version">gcovr 6.0</xsl:attribute>
                <xsl:call-template name="packages"/>
            </xsl:if>
        </xsl:element>
    </xsl:template>

    <xsl:template name="packages">
        <xsl:element name="packages">
            <xsl:for-each-group select="/Coverage/Locations/Loc" group-by="substring-before(@uri, tokenize(@uri, '/')[last()])">
                <xsl:variable name="lineRateForPacakgeTag">
                    <xsl:call-template name="getLineRateForClassOrPackage">
                        <xsl:with-param name="parentsOfLines" select="current-group()"/>
                    </xsl:call-template>
                </xsl:variable>
                <xsl:if test="$lineRateForPacakgeTag != -1">
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
                            <xsl:value-of select="$lineRateForPacakgeTag"/>
                        </xsl:attribute>
                        <xsl:element name="classes">
                            <xsl:for-each select="current-group()">
                                <xsl:variable name="filePath">
                                <xsl:value-of select="substring-after(@uri, concat(translate($pipelineBuildWorkingDirectory, '\', '/'), '/'))"/>
                                </xsl:variable>
                                <xsl:variable name="locRef" select="@locRef"/>
                                <xsl:variable name="cvgDataNode" select="//CvgData[@locRef=$locRef]"/>
                                <xsl:choose>
                                    <xsl:when test="$toolName = 'jtest'">
                                        <xsl:variable name="typeItemNodes" select="$cvgDataNode/Stats//Item[has-children()]"/>
                                        <xsl:for-each select="$typeItemNodes">
                                            <xsl:variable name="methodItemRefsUnderCurrentType" select="./Item[not(has-children())]/@itemRef"/>
                                            <xsl:variable name="className">
                                                <xsl:call-template name="getProcessedClassNameForJavaLanguage">
                                                    <xsl:with-param name="packageName" select="$packageName"/>
                                                    <xsl:with-param name="originalClassName" select="@name"/>
                                                </xsl:call-template>
                                            </xsl:variable>
                                            <xsl:call-template name="generateClassElementWithSpecificItemRefs">
                                                <xsl:with-param name="itemRefs" select="$methodItemRefsUnderCurrentType"/>
                                                <xsl:with-param name="cvgDataNode" select="$cvgDataNode"/>
                                                <xsl:with-param name="className" select="$className"/>
                                                <xsl:with-param name="filePath" select="$filePath"/>
                                            </xsl:call-template>
                                        </xsl:for-each>
                                    </xsl:when>
                                    <xsl:otherwise>
                                        <xsl:variable name="allItemRefsUnderCurrentFile" select="$cvgDataNode/Stats//Item/@itemRef"/>
                                        <xsl:variable name="className">
                                            <xsl:call-template name="getClassNameForDotNetAndCLanguage">
                                                <xsl:with-param name="filePath" select="$filePath"/>
                                            </xsl:call-template>
                                        </xsl:variable>
                                        <xsl:call-template name="generateClassElementWithSpecificItemRefs">
                                            <xsl:with-param name="itemRefs" select="$allItemRefsUnderCurrentFile"/>
                                            <xsl:with-param name="cvgDataNode" select="$cvgDataNode"/>
                                            <xsl:with-param name="className" select="$className"/>
                                            <xsl:with-param name="filePath" select="$filePath"/>
                                        </xsl:call-template>
                                    </xsl:otherwise>
                                </xsl:choose>
                            </xsl:for-each>
                        </xsl:element>
                    </xsl:element>
                </xsl:if>
            </xsl:for-each-group>
        </xsl:element>
    </xsl:template>

    <xsl:template name="generateClassElementWithSpecificItemRefs">
        <!-- itemRefs are got from attribute of /CoverageData/CvgData/Stats/Item nodes,
             they will be used to found the coverable lines.
             all lines related these itemRefs will be used to generate <line> nodes 
             and <line> nodes wiil be placed under a <class> node  -->
        <xsl:param name="itemRefs"/>
        <xsl:param name="cvgDataNode"/>
        <xsl:param name="className"/>
        <xsl:param name="filePath"/>

        <!--The work flow to generate class element:
            1. Filter the /CoverageData/CvgData/Static/StatCvg nodes by itemRef attribute to get the value of elems attributes
            2. Get line numbers(coverable lines) by parsing the value of elems attributes
            3. Traverse the coverable lines and filter the /CoverageData/CvgData/Dynamic/DynCvg/CtxCvg nodes by each coverabled line
            4. if <CtxCvg> nodes are found, it means this line is covered(covered line), use testRefs attribute to calculate the covered times(hits) of line
            5. Calcute the class line-rate = {the number of coverable lines} / {the number of covered line}  -->

        <xsl:variable name="itemRefsString" select="concat(' ', string-join($itemRefs, ' '), ' ')"/>
        <xsl:variable name="statCvgElems" select="$cvgDataNode/Static/StatCvg[contains($itemRefsString, concat(' ', @itemRef, ' '))]/@elems"/>
        <xsl:variable name="statCvgElemsString" select="string-join($statCvgElems, ' ')"/>
        <xsl:variable name="lineNumbers" select="distinct-values(tokenize($statCvgElemsString, '\s+'))"/>

        <!-- Use a map to store the line numbers. key: line number, value: useless fake number -->
        <xsl:variable name="linesMap" as="map(xs:string, xs:integer)">
            <xsl:map>
                <xsl:for-each select="$lineNumbers">
                    <xsl:map-entry key="string(.)" select="-1"/>
                </xsl:for-each>
            </xsl:map>
        </xsl:variable>

        <xsl:if test="count(map:keys($linesMap)) > 0">
            <xsl:element name="class">
                <xsl:attribute name="filename">
                    <xsl:value-of select="$filePath"/>
                </xsl:attribute>
                <xsl:attribute name="name">
                    <xsl:value-of select="$className"/>
                </xsl:attribute>
                <xsl:attribute name="line-rate">
                    <!-- Use a map to store covered lines. key: covered line number, value: useless fake number -->
                    <xsl:variable name="coveredLinesMap" as="map(xs:string, xs:integer)">
                        <xsl:map>
                            <xsl:for-each select="map:keys($linesMap)">
                                <xsl:variable name="lineNUmber" select="."/>
                                <!-- User ' ' to aviod incorrect match, like contains('line1 line23', 'line2') the result is true,
                                     but contains(' line1 line23 ', ' line2 ') is false and which is wanted -->
                                <xsl:variable name="ctxCvgNodes" select="$cvgDataNode/Dynamic/DynCvg/CtxCvg[contains(concat(' ', @elemRefs, ' '), concat(' ', $lineNUmber, ' '))]"/>
                                <xsl:variable name="isReached" select="count(tokenize(string-join($ctxCvgNodes/@testRefs, ' '), '\s+')) > 0"/>
                                <xsl:if test="$isReached">
                                    <xsl:map-entry key="string(.)" select="1"/>
                                </xsl:if>
                            </xsl:for-each>
                        </xsl:map>
                    </xsl:variable>
                    <xsl:value-of select="count(map:keys($coveredLinesMap)) div count(map:keys($linesMap))"/>
                </xsl:attribute>
                <xsl:element name="lines">
                    <xsl:for-each select="map:keys($linesMap)">
                        <xsl:sort data-type="number"/>
                        <xsl:element name="line">
                            <xsl:variable name="lineNUmber" select="."/>
                            <xsl:attribute name="number">
                                <xsl:value-of select="$lineNUmber"/>
                            </xsl:attribute>
                            <xsl:attribute name="hits">
                                <xsl:variable name="ctxCvgNodes" select="$cvgDataNode/Dynamic/DynCvg/CtxCvg[contains(concat(' ', @elemRefs, ' '), concat(' ', $lineNUmber, ' '))]"/>
                                <xsl:variable name="coveredTimes" select="count(tokenize(string-join($ctxCvgNodes/@testRefs, ' '), '\s+'))"/>
                                <xsl:value-of select="$coveredTimes"/>
                            </xsl:attribute>
                        </xsl:element>
                    </xsl:for-each>
                </xsl:element>
            </xsl:element>
        </xsl:if>
    </xsl:template>

    <xsl:template name="getLineRateForClassOrPackage">
        <xsl:param name="parentsOfLines"/>
        <xsl:variable name="totalLines" as="xs:integer*">
            <xsl:for-each select="$parentsOfLines">
                <xsl:variable name="lineNumbers" as="xs:string*">
                        <xsl:variable name="locRefValue" select="@locRef"/>
                        <xsl:variable name="statCvgElems" select="string-join(/Coverage/CoverageData/CvgData[@locRef = $locRefValue]/Static/StatCvg/@elems, ' ')"/>
                        <xsl:sequence select="distinct-values(tokenize($statCvgElems, '\s+'))"/>
                </xsl:variable>
                <xsl:sequence select="count($lineNumbers)"/>
            </xsl:for-each>
        </xsl:variable>

        <xsl:variable name="coveredLines" as="xs:integer*">
            <xsl:for-each select="$parentsOfLines">
                <xsl:variable name="coveredLineNumbers" as="xs:string*">
                    <xsl:variable name="locRefValue" select="@locRef"/>
                    <xsl:variable name="coveredLinesSeq" as="xs:string*">
                        <xsl:for-each select="/Coverage/CoverageData/CvgData[@locRef = $locRefValue]/Dynamic//DynCvg">
                            <xsl:sequence select="string(string-join(.//CtxCvg/@elemRefs, ' '))"/>
                        </xsl:for-each>
                    </xsl:variable>
                    <xsl:sequence select="tokenize(string-join($coveredLinesSeq, ' '), '\s+')"/>
                </xsl:variable>
                <xsl:sequence select="count(distinct-values($coveredLineNumbers))"/>
            </xsl:for-each>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="sum($totalLines) > 0">
                <xsl:value-of select="sum($coveredLines) div sum($totalLines)"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="-1"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="getPackageName">
        <xsl:param name="projectPath"/>
        <xsl:variable name="delimiter" select="'/'"/>
        <xsl:variable name="segments" select="tokenize($projectPath, '/')"/>
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
                                <xsl:value-of select="'&lt;default&gt;'"/>
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

    <xsl:template name="getClassNameForDotNetAndCLanguage">
        <xsl:param name="filePath"/>
        <xsl:variable name="fileName" select="tokenize($filePath, '/')[last()]"/>
        <xsl:value-of select="$fileName"/>
    </xsl:template>

    <xsl:template name="getProcessedClassNameForJavaLanguage">
        <xsl:param name="packageName"/>
        <xsl:param name="originalClassName"/>
        <xsl:choose>
            <xsl:when test="$packageName != '&lt;default&gt;'">
                <xsl:value-of select="concat($packageName, '.', translate($originalClassName, '$', '#'))"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="translate($originalClassName, '$', '#')"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
</xsl:stylesheet>