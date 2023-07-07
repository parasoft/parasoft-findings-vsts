package com.parasoft.findings.ado.testcases;

import com.parasoft.findings.ado.common.GlobalUtils;
import com.parasoft.findings.ado.common.Properties;
import com.parasoft.findings.ado.common.WebDriverInitialization;
import com.parasoft.findings.ado.pages.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.WebDriver;

import static org.junit.jupiter.api.Assertions.assertTrue;

public class DottestProjectTests {

    private WebDriver driver;

    @BeforeEach
    public void beforeTest() {
        driver = WebDriverInitialization.init();
        driver.manage().window().maximize();
    }

    @AfterEach
    public void afterTest() {
        if (driver != null) {
            driver.quit();
        }
    }

    @Test
    public void testParasoftFindingsPlugin() {
        GlobalUtils.login(driver);

        GlobalUtils.createProject(driver, Properties.DOTTEST_PROJECT_NAME);

        GlobalUtils.importRepository(driver, Properties.CLONE_DOTTEST_PROJECT_URL);

        CreatePipelinesPage createPipelinesPage = new CreatePipelinesPage(driver);
        GlobalUtils.createPipeline(createPipelinesPage);
        GlobalUtils.addCommandLineTask(createPipelinesPage, Properties.GENERATE_STATIC_ANALYSIS_REPORT, Properties.GENERATE_DOTTEST_STATIC_ANALYSIS_REPORT_COMMAND);
        GlobalUtils.addPublishParasoftResultsTask(createPipelinesPage, Properties.ANALYZE_STATIC_ANALYSIS_REPORT, Properties.DOTTEST_STATIC_ANALYSIS_RESULTS_FILES_PATH, Properties.SETTINGS_FIELD);
        createPipelinesPage.clickSaveAndQueue();

        PipelineRunPage pipelineRunPage = new PipelineRunPage(driver);
        pipelineRunPage.clickScansTab();
        pipelineRunPage.switchToFrame();
        String currentUrl = driver.getCurrentUrl();

        assertTrue(pipelineRunPage.getReportTitle().contains(Properties.DOTTEST_REPORT_TOOL_NAME));
        assertTrue(pipelineRunPage.getReportTitle().contains(Properties.DOTTEST_NUMBER_OF_RULE_DOCS));
        String ruleLinkText = pipelineRunPage.getRuleLinkText();

        driver.get(pipelineRunPage.getRuleDocUrl());
        RuleDocPage ruleDocPage = new RuleDocPage(driver);
        assertTrue(ruleDocPage.getDottestRuleText().contains(ruleLinkText));

        driver.get(currentUrl);
        PipelineRunPage scansPage = new PipelineRunPage(driver);
        scansPage.switchToFrame();
        String fileLinkText = scansPage.getFileLinkText();

        driver.get(scansPage.getFileUrl());
        RepositoryPage sourceCodeRepositoryPage = new RepositoryPage(driver);
        assertTrue(fileLinkText.contains(sourceCodeRepositoryPage.getFileName()));
        sourceCodeRepositoryPage.clickProjectSettings();

        GlobalUtils.deleteProject(driver, Properties.DOTTEST_PROJECT_NAME);
    }
}
