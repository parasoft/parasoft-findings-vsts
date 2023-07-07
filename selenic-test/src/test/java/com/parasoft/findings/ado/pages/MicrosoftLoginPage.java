package com.parasoft.findings.ado.pages;

import com.parasoft.findings.ado.common.ElementUtils;
import com.parasoft.findings.ado.common.Properties;
import org.openqa.selenium.*;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class MicrosoftLoginPage {
    @FindBy(name = "loginfmt")
    private WebElement accountField;

    @FindBy(css = "input[value='Next']")
    private WebElement nextButton;

    @FindBy(name = "passwd")
    private WebElement passwdField;

    @FindBy(css = "input[value='Sign in']")
    private WebElement signInButton;

    @FindBy(css = "input[value='No']")
    private WebElement noButton;

    private WebDriver driver;

    public MicrosoftLoginPage(WebDriver driver) {
        this.driver = driver;
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(Properties.WAIT_FOR_TIMEOUT));
        wait.ignoring(StaleElementReferenceException.class);
        PageFactory.initElements(driver, this);
    }

    public void setLoginAccountField(String text) {
        ElementUtils.waitUntilVisible(driver, accountField, Properties.WAIT_FOR_TIMEOUT);
        accountField.sendKeys(text);
    }

    public void clickNextButton() {
        ElementUtils.waitUntilVisible(driver, nextButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, nextButton);
    }

    public void setPasswdField(String text) {
        ElementUtils.waitUntilVisible(driver, passwdField, Properties.WAIT_FOR_TIMEOUT);
        passwdField.sendKeys(text);
    }

    public void clickSignInButton() {
        ElementUtils.waitUntilVisible(driver, signInButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, signInButton);
    }

    public void clickNoButton() {
        ElementUtils.waitUntilVisible(driver, noButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, noButton);
    }
}
