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

public class RuleDocPage {
    @FindBy(xpath = "/html/body/strong[1]")
    private WebElement jtestRuleText;

    @FindBy(xpath = "//*[@id='TitleRow']/h1")
    private WebElement dottestRuleText;

    private WebDriver driver;

    public RuleDocPage(WebDriver driver) {
        this.driver = driver;
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(Properties.WAIT_FOR_TIMEOUT));
        wait.ignoring(StaleElementReferenceException.class);
        PageFactory.initElements(driver, this);
    }

    public String getJtestRuleText() {
        ElementUtils.waitUntilVisible(driver, jtestRuleText, Properties.WAIT_FOR_TIMEOUT);
        return jtestRuleText.getText();
    }

    public String getDottestRuleText() {
        ElementUtils.waitUntilVisible(driver, dottestRuleText, Properties.WAIT_FOR_TIMEOUT);
        return dottestRuleText.getText();
    }
}
