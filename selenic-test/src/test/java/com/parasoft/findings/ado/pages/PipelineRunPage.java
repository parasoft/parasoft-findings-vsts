package com.parasoft.findings.ado.pages;

import com.parasoft.findings.ado.common.ElementUtils;
import com.parasoft.findings.ado.common.Properties;
import org.openqa.selenium.StaleElementReferenceException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class PipelineRunPage {
    @FindBy(css = "#__bolt-tab-sariftools-scans-build-tab .bolt-tab-text")
    private WebElement scansTab;

    @FindBy(xpath = "//div[@class='bolt-table-container flex-grow h-scroll-hidden']//a/td[3]//span")
    private WebElement status;

    @FindBy(className = "external-content")
    private WebElement scansContent;

    @FindBy(className = "external-content--iframe")
    private WebElement externalContentIframe;

    @FindBy(xpath = "//span[@class='swcRunTitle']")
    private WebElement reportTitle;

    @FindBy(xpath = "//div[@class='swcRowRule']/a")
    private WebElement ruleLink;

    @FindBy(xpath = "//tbody[@class='relative']/tr[4]//a")
    private WebElement fileLink;

    private WebDriver driver;

    public PipelineRunPage(WebDriver driver) {
        this.driver = driver;
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(Properties.WAIT_FOR_TIMEOUT));
        wait.ignoring(StaleElementReferenceException.class);
        PageFactory.initElements(driver, this);
    }

    public void clickScansTab() {
        ElementUtils.waitUntilVisible(driver, scansTab, Properties.WAIT_FOR_TIMEOUT);
        while (true){
            String statusText = status.getText();
            if (statusText.equals("Success") || statusText.equals("Failed")) {
                break;
            }
        }
        ElementUtils.clickElementUseJs(driver, scansTab);
    }

    public void switchToFrame() {
        ElementUtils.waitUntilVisible(driver, scansContent, Properties.WAIT_FOR_TIMEOUT);
        driver.switchTo().frame(externalContentIframe);
    }

    public String getReportTitle() {
        ElementUtils.waitUntilVisible(driver, reportTitle, Properties.WAIT_FOR_TIMEOUT);
        return reportTitle.getText();
    }

    public String getRuleLinkText() {
        ElementUtils.waitUntilVisible(driver, ruleLink, Properties.WAIT_FOR_TIMEOUT);
        return ruleLink.getText();
    }

    public String getRuleDocUrl() {
        ElementUtils.waitUntilVisible(driver, ruleLink, Properties.WAIT_FOR_TIMEOUT);
        return ruleLink.getAttribute("href");
    }

    public String getFileUrl() {
        ElementUtils.waitUntilVisible(driver, fileLink, Properties.WAIT_FOR_TIMEOUT);
        return fileLink.getAttribute("href");
    }

    public String getFileLinkText() {
        ElementUtils.waitUntilVisible(driver, fileLink, Properties.WAIT_FOR_TIMEOUT);
        return fileLink.getText();
    }
}
